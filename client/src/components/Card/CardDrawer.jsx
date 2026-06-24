import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Drawer, Box, Typography, TextField, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Divider, IconButton,
  Chip, Tooltip, Button, Menu, Autocomplete,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { getCard, updateCard, setCardFields, deleteCard, moveCardBoard, addCardAttachment, removeCardAttachment } from '../../api/cards';
import { uploadFile } from '../../api/uploads';
import { getBoards, getBoard } from '../../api/boards';
import CardSubtasks from './CardSubtasks';
import CardComments from './CardComments';
import Linkify from '../../utils/linkify';
import RichContent from '../common/RichContent';
import RichTextField from '../common/RichTextField';
import Collapsible from '../common/Collapsible';
import { tagColor } from '../../utils/tagColor';

const HEALTH_COLORS = {
  'Good': '#4caf50',
  'Ok': '#ff9800',
  'Needs Work': '#f44336',
  'Waiting on DCM': '#2196f3',
};

// Tag chip color via inline `style`: selected chips inside the Autocomplete carry
// the .MuiAutocomplete-tag class whose fill beats class-based sx (even !important),
// so an inline style on the element is the only thing that reliably wins.
const tagChipStyle = (c) => ({ backgroundColor: c.bg, color: c.text });
const tagChipSx = {
  fontWeight: 600, height: 22, fontSize: 11,
  '& .MuiChip-label': { color: 'inherit' },
  '& .MuiChip-deleteIcon': { color: 'inherit', opacity: 0.55, '&:hover': { opacity: 0.85 } },
};

function FieldRow({ label, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 0.75 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, pt: 1, fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1 }}>{children}</Box>
    </Box>
  );
}

export default function CardDrawer({ cardId, open, onClose, board, columns, fields, users, templates = [], allTags = [], onCardUpdate, onCardDelete, onCardMove }) {
  const [card, setCard] = useState(null);
  const [comments, setComments] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  // Custom fields the user revealed on this card despite having no value yet.
  const [extraFieldIds, setExtraFieldIds] = useState([]);
  const [addFieldAnchor, setAddFieldAnchor] = useState(null);

  useEffect(() => {
    if (!open || !cardId) return;
    setLoading(true);
    getCard(cardId)
      .then(data => {
        setCard(data);
        setTitleValue(data.title);
        setComments(data.comments || []);
        setSubtasks(data.subtasks || []);
        setExtraFieldIds([]);
      })
      .finally(() => setLoading(false));
  }, [cardId, open]);

  const saveField = useCallback(async (patch) => {
    if (!card) return;
    const updated = await updateCard(card._id, patch);
    setCard(prev => ({ ...prev, ...updated }));
    onCardUpdate?.(updated);
  }, [card, onCardUpdate]);

  const saveCustomField = useCallback(async (fieldId, value) => {
    if (!card) return;
    const updated = await setCardFields(card._id, { [fieldId]: value });
    setCard(prev => ({ ...prev, fieldValues: updated.fieldValues }));
    onCardUpdate?.(updated);
  }, [card, onCardUpdate]);

  const [templateAnchor, setTemplateAnchor] = useState(null);

  const handleApplyTemplate = async (template) => {
    setTemplateAnchor(null);
    const now = new Date();

    // Only fill fields that are currently empty on the card
    const patch = {};
    if (!card.assigneeId && template.defaultAssigneeId)
      patch.assigneeId = template.defaultAssigneeId;
    if (!card.dueDate && template.dueDateOffsetDays)
      patch.dueDate = new Date(now.getTime() + template.dueDateOffsetDays * 86400000).toISOString();
    if (!card.description?.trim() && template.descriptionTemplate)
      patch.description = template.descriptionTemplate;

    if (Object.keys(patch).length) {
      const updated = await updateCard(card._id, patch);
      setCard(prev => ({ ...prev, ...updated }));
      onCardUpdate?.(updated);
    }

    // Merge field values — only fill fields with no current value
    if (template.defaultFieldValues?.length) {
      const existingFieldIds = new Set(card.fieldValues?.map(fv => fv.fieldId?.toString()));
      const toSet = template.defaultFieldValues.filter(fv => !existingFieldIds.has(fv.fieldId?.toString()));
      if (toSet.length) {
        const fieldPatch = {};
        toSet.forEach(fv => { fieldPatch[fv.fieldId] = fv.valueEnum ?? fv.valueText ?? fv.valueNumber; });
        const updated = await setCardFields(card._id, fieldPatch);
        setCard(prev => ({ ...prev, fieldValues: updated.fieldValues }));
        onCardUpdate?.(updated);
      }
    }

    // Add default subtasks from template — skip any already present (matched by title)
    if (template.defaultSubtasks?.length) {
      const { createSubtask } = await import('../../api/subtasks');
      const existingTitles = new Set(subtasks.map(s => s.title.trim().toLowerCase()));
      const toAdd = template.defaultSubtasks.filter(s => !existingTitles.has(s.title.trim().toLowerCase()));
      if (toAdd.length) {
        const created = await Promise.all(
          toAdd.map(s => createSubtask(card._id, {
            title: s.title,
            dueDate: s.dueDateOffsetDays
              ? new Date(now.getTime() + s.dueDateOffsetDays * 86400000).toISOString()
              : null,
          }))
        );
        setSubtasks(prev => [...prev, ...created]);
      }
    }
  };

  const handleDelete = async () => {
    await deleteCard(card._id);
    onCardDelete?.(card._id);
    onClose();
  };

  // Attachments (standalone files, any type)
  const attachInputRef = useRef(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const handleAddAttachment = async (file) => {
    if (!file) return;
    setUploadingAttachment(true);
    try {
      const url = await uploadFile(file);
      const updated = await addCardAttachment(card._id, { name: file.name, url, isImage: file.type?.startsWith('image/') });
      setCard(prev => ({ ...prev, attachments: updated.attachments }));
      onCardUpdate?.(updated);
    } catch {
      window.alert('Upload failed.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async (url) => {
    const updated = await removeCardAttachment(card._id, url);
    setCard(prev => ({ ...prev, attachments: updated.attachments }));
    onCardUpdate?.(updated);
  };

  // Move card to another board (project)
  const [moveOpen, setMoveOpen] = useState(false);
  const [boards, setBoards] = useState([]);
  const [targetBoardId, setTargetBoardId] = useState('');
  const [targetColumns, setTargetColumns] = useState([]);
  const [targetColumnId, setTargetColumnId] = useState('');
  const [moving, setMoving] = useState(false);

  const openMove = async () => {
    setMoveOpen(true);
    setTargetBoardId('');
    setTargetColumnId('');
    setTargetColumns([]);
    if (boards.length === 0) {
      const data = await getBoards();
      setBoards(data);
    }
  };

  const handleTargetBoardChange = async (boardId) => {
    setTargetBoardId(boardId);
    setTargetColumnId('');
    setTargetColumns([]);
    const data = await getBoard(boardId);
    setTargetColumns(data.columns || []);
  };

  const handleMove = async () => {
    if (!targetBoardId || !targetColumnId) return;
    setMoving(true);
    try {
      await moveCardBoard(card._id, { boardId: targetBoardId, columnId: targetColumnId });
      setMoveOpen(false);
      onCardMove?.(card._id);
      onClose();
    } finally {
      setMoving(false);
    }
  };

  const handleArchiveToggle = async () => {
    const updated = await updateCard(card._id, { isArchived: !card.isArchived });
    setCard(prev => ({ ...prev, ...updated }));
    onCardUpdate?.(updated);
  };

  const isCardEmpty = card && !card.description?.trim()
    && !card.fieldValues?.some(fv => fv.valueText || fv.valueEnum || fv.valueNumber != null || fv.valueDate)
    && comments.length === 0
    && subtasks.length === 0;

  // Archived OR completed cards are read-only. Re-open via Unarchive / Mark incomplete.
  const readOnly = !!(card && (card.isArchived || card.isCompleted));

  const handleTitleSave = async () => {
    if (titleValue.trim() && titleValue !== card.title) {
      await saveField({ title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const getFieldValue = (fieldId) => {
    const fv = card?.fieldValues?.find(v => v.fieldId?.toString() === fieldId?.toString());
    if (!fv) return '';
    return fv.valueEnum ?? fv.valueText ?? fv.valueNumber ?? fv.valueDate ?? '';
  };

  const hasFieldValue = (fieldId) => {
    const v = getFieldValue(fieldId);
    return v !== '' && v != null;
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="temporary"
      slotProps={{
        // Force the panel pinned to the viewport's right edge regardless of how
        // wide the board behind it is.
        paper: {
          sx: {
            width: { xs: '100%', sm: 560 },
            p: 0,
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100%',
            maxWidth: '100vw',
          },
        },
      }}
    >
      {loading || !card ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', opacity: card.isArchived ? 0.75 : 1 }}>
          {/* Header */}
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              {editingTitle && !readOnly ? (
                <TextField
                  autoFocus fullWidth size="small"
                  value={titleValue}
                  onChange={e => setTitleValue(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false); }}
                  variant="standard"
                  slotProps={{ input: { style: { fontSize: 18, fontWeight: 700 } } }}
                />
              ) : (
                <Typography
                  variant="h6" fontWeight={700}
                  onClick={() => { if (!readOnly) setEditingTitle(true); }}
                  sx={{
                    cursor: readOnly ? 'default' : 'text',
                    textDecoration: card.isCompleted ? 'line-through' : 'none',
                    color: card.isCompleted ? 'text.secondary' : 'text.primary',
                    '&:hover': { bgcolor: readOnly ? 'transparent' : 'action.hover', borderRadius: 1 },
                    px: 0.5, mx: -0.5,
                  }}
                >
                  {card.title}
                </Typography>
              )}
            </Box>
            {!readOnly && templates.length > 0 && (
              <>
                <Tooltip title="Apply template">
                  <IconButton size="small" onClick={e => setTemplateAnchor(e.currentTarget)}>
                    <AutoAwesomeIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Menu anchorEl={templateAnchor} open={Boolean(templateAnchor)} onClose={() => setTemplateAnchor(null)}>
                  {templates.map(t => (
                    <MenuItem key={t._id} onClick={() => handleApplyTemplate(t)} dense>{t.name}</MenuItem>
                  ))}
                </Menu>
              </>
            )}
            {!readOnly && (
              <Tooltip title="Move to another project">
                <IconButton onClick={openMove} size="small" sx={{ color: 'text.secondary' }}>
                  <DriveFileMoveOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={card.isArchived ? 'Unarchive card' : 'Archive card'}>
              <IconButton onClick={handleArchiveToggle} size="small" sx={{ color: card.isArchived ? '#4573d2' : 'text.secondary' }}>
                {card.isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            {isCardEmpty && !readOnly && (
              <Tooltip title="Delete card">
                <IconButton onClick={handleDelete} size="small" sx={{ color: 'error.main' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
          </Box>

          {(card.isArchived || card.isCompleted) && (
            <Box sx={{ px: 3, py: 1, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                {card.isArchived
                  ? 'This card is archived. Unarchive to make changes.'
                  : 'This card is completed. Mark incomplete to edit.'}
              </Typography>
            </Box>
          )}

          {/* Body */}
          <Box sx={{ px: 3, py: 2, flex: 1 }}>
            {/* Mark complete / incomplete — always interactive (the escape hatch);
                hidden for archived cards, which are managed via unarchive. */}
            {!card.isArchived && (
              <Button
                size="small"
                variant={card.isCompleted ? 'contained' : 'outlined'}
                startIcon={card.isCompleted ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
                onClick={() => saveField({ isCompleted: !card.isCompleted })}
                sx={card.isCompleted
                  ? { mb: 2, bgcolor: '#4caf50', '&:hover': { bgcolor: '#43a047' }, textTransform: 'none' }
                  : { mb: 2, color: 'text.secondary', borderColor: 'divider', textTransform: 'none', '&:hover': { borderColor: '#4caf50', color: '#4caf50' } }}
              >
                {card.isCompleted ? 'Completed' : 'Mark complete'}
              </Button>
            )}

            {/* Editable content — locked (read-only) when archived or completed.
                Links/images stay clickable so you can still read & download. */}
            <Box sx={{
              pointerEvents: readOnly ? 'none' : 'auto',
              opacity: readOnly ? 0.6 : 1,
              '& a, & img': { pointerEvents: 'auto' },
            }}>
            {/* Core fields */}
            <FieldRow label="Status">
              <FormControl size="small" fullWidth>
                <Select
                  value={card.columnId?.toString() || ''}
                  onChange={e => saveField({ columnId: e.target.value })}
                >
                  {columns.map(col => (
                    <MenuItem key={col._id} value={col._id.toString()}>{col.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </FieldRow>

            <FieldRow label="Assignee">
              <FormControl size="small" fullWidth>
                <Select
                  value={card.assigneeId?.toString() || ''}
                  onChange={e => saveField({ assigneeId: e.target.value || null })}
                  displayEmpty
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {users.map(u => <MenuItem key={u._id} value={u._id.toString()}>{u.name}</MenuItem>)}
                </Select>
              </FormControl>
            </FieldRow>

            <FieldRow label="Due date">
              <TextField
                size="small"
                type="date"
                fullWidth
                value={card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : ''}
                onChange={e => saveField({ dueDate: e.target.value || null })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </FieldRow>

            {/* Tags — Asana-style combobox: type to filter, pick existing, or create new */}
            <FieldRow label="Tags">
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={allTags}
                value={card.tags || []}
                onChange={(_e, newValue) => {
                  const next = [...new Set(
                    newValue
                      .map(t => (typeof t === 'string' ? t : t.inputValue))
                      .map(t => t.trim())
                      .filter(Boolean)
                  )];
                  setCard(prev => ({ ...prev, tags: next }));
                  saveField({ tags: next });
                }}
                isOptionEqualToValue={(opt, val) => (typeof opt === 'string' ? opt : opt.inputValue) === val}
                getOptionLabel={opt => (typeof opt === 'string' ? opt : opt.inputValue)}
                filterOptions={(options, params) => {
                  const input = params.inputValue.trim();
                  const selected = new Set((card.tags || []).map(t => t.toLowerCase()));
                  const filtered = options.filter(o =>
                    !selected.has(o.toLowerCase()) &&
                    o.toLowerCase().includes(input.toLowerCase())
                  );
                  const exists = options.some(o => o.toLowerCase() === input.toLowerCase()) || selected.has(input.toLowerCase());
                  if (input !== '' && !exists) filtered.push({ inputValue: input, create: true });
                  return filtered;
                }}
                renderOption={(props, option) => {
                  const { key, ...rest } = props;
                  if (typeof option !== 'string') {
                    return <li key={key} {...rest}>Create “{option.inputValue}”</li>;
                  }
                  const c = tagColor(option);
                  return <li key={key} {...rest}><Chip label={option} size="small" style={tagChipStyle(c)} sx={tagChipSx} /></li>;
                }}
                renderTags={(value, getTagProps) =>
                  value.map((tag, index) => {
                    const c = tagColor(tag);
                    const { key, onDelete, ...rest } = getTagProps({ index });
                    // Plain styled pill (not MUI Chip) so the fill can't be overridden
                    // by MUI's .MuiChip-filled / .MuiAutocomplete-tag styling.
                    return (
                      <Box
                        key={key}
                        {...rest}
                        style={{ backgroundColor: c.bg, color: c.text }}
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.25,
                          fontWeight: 600, fontSize: 11,
                          height: 22, borderRadius: '11px', pl: 1, pr: 0.25, m: '2px',
                          maxWidth: '100%',
                        }}
                      >
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tag}
                        </Box>
                        <CloseIcon
                          onClick={onDelete}
                          sx={{ fontSize: 15, cursor: 'pointer', color: c.text, opacity: 0.55, '&:hover': { opacity: 0.9 } }}
                        />
                      </Box>
                    );
                  })
                }
                renderInput={params => (
                  <TextField {...params} variant="standard" placeholder={(card.tags || []).length ? '' : 'Add tags…'} />
                )}
              />
            </FieldRow>

            {/* Custom fields — show only those with a value (or ones the user added) */}
            {fields
              .filter(field => hasFieldValue(field._id) || extraFieldIds.includes(field._id.toString()))
              .map(field => (
              <FieldRow key={field._id} label={field.name}>
                {field.type === 'enum' ? (
                  <FormControl size="small" fullWidth>
                    <Select
                      value={getFieldValue(field._id)}
                      onChange={e => saveCustomField(field._id, e.target.value)}
                      displayEmpty
                      renderValue={v => v ? (
                        field.name === 'Health'
                          ? <Chip label={v} size="small" sx={{ bgcolor: HEALTH_COLORS[v], color: '#fff', height: 20, fontSize: 11 }} />
                          : v
                      ) : <em>None</em>}
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {field.options.map(o => (
                        <MenuItem key={o} value={o}>
                          {field.name === 'Health'
                            ? <Chip label={o} size="small" sx={{ bgcolor: HEALTH_COLORS[o], color: '#fff', height: 20, fontSize: 11 }} />
                            : o}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : field.type === 'date' ? (
                  <TextField
                    size="small" fullWidth type="date"
                    value={getFieldValue(field._id) ? new Date(getFieldValue(field._id)).toISOString().split('T')[0] : ''}
                    onChange={e => saveCustomField(field._id, e.target.value || null)}
                  />
                ) : field.type === 'url' ? (
                  <TextField
                    size="small" fullWidth type="url"
                    defaultValue={getFieldValue(field._id)}
                    onBlur={e => saveCustomField(field._id, e.target.value)}
                  />
                ) : (
                  <TextField
                    size="small" fullWidth
                    type={field.type === 'number' ? 'number' : 'text'}
                    defaultValue={getFieldValue(field._id)}
                    onBlur={e => saveCustomField(field._id, e.target.value)}
                  />
                )}
              </FieldRow>
            ))}

            {/* Add field — reveal a board field that has no value on this card yet */}
            {(() => {
              const addable = fields.filter(f => !hasFieldValue(f._id) && !extraFieldIds.includes(f._id.toString()));
              if (!addable.length) return null;
              return (
                <Box sx={{ pt: 0.5 }}>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={e => setAddFieldAnchor(e.currentTarget)}
                    sx={{ color: 'text.secondary', textTransform: 'none' }}
                  >
                    Add field
                  </Button>
                  <Menu anchorEl={addFieldAnchor} open={Boolean(addFieldAnchor)} onClose={() => setAddFieldAnchor(null)}>
                    {addable.map(f => (
                      <MenuItem
                        key={f._id}
                        dense
                        onClick={() => {
                          setExtraFieldIds(prev => [...prev, f._id.toString()]);
                          setAddFieldAnchor(null);
                        }}
                      >
                        {f.name}
                      </MenuItem>
                    ))}
                  </Menu>
                </Box>
              );
            })()}

            <Divider sx={{ my: 2 }} />

            {/* Description */}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>Description</Typography>
            {editingDesc && !readOnly ? (
              <RichTextField
                key={`desc-${card._id}`}
                initialValue={card.descriptionHtml || card.description || ''}
                minHeight={140}
                onSave={async (html) => {
                  await saveField({ description: html.replace(/<[^>]*>/g, '').trim(), descriptionHtml: html });
                  setEditingDesc(false);
                }}
                onCancel={() => setEditingDesc(false)}
              />
            ) : (
              <Box
                onClick={() => { if (!readOnly) setEditingDesc(true); }}
                sx={{
                  minHeight: 48, p: 1, borderRadius: 1,
                  fontSize: 14, // match the editor's font size (read = edit)
                  cursor: readOnly ? 'default' : 'text',
                  color: (card.description || card.descriptionHtml) ? 'text.primary' : 'text.disabled',
                  whiteSpace: card.descriptionHtml ? 'normal' : 'pre-wrap',
                  '&:hover': { bgcolor: readOnly ? 'transparent' : 'action.hover' },
                }}
              >
                <Collapsible collapsedHeight={280}>
                  {card.descriptionHtml
                    ? <RichContent html={card.descriptionHtml} />
                    : (card.description ? <Linkify text={card.description} /> : 'Add a description…')}
                </Collapsible>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Attachments — standalone files (not the inline images in text). */}
            {(() => {
              const files = (card.attachments || []).filter(a => !a.inline);
              if (!files.length && readOnly) return null;
              return (
              <>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>
                  Attachments{files.length ? ` (${files.length})` : ''}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {files.map((att, i) => (
                    <Box key={att.url || i} sx={{ position: 'relative', width: 96, height: 96 }}>
                      <Tooltip title={att.name || 'attachment'}>
                        <Box
                          component="a"
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '100%', height: '100%', borderRadius: 1,
                            border: '1px solid', borderColor: 'divider', overflow: 'hidden',
                            textDecoration: 'none', color: 'text.secondary',
                            p: att.isImage ? 0 : 1,
                            '&:hover': { borderColor: '#4573d2' },
                          }}
                        >
                          {att.isImage ? (
                            <Box component="img" src={att.url} alt={att.name || ''} loading="lazy"
                              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <Box sx={{ textAlign: 'center', overflow: 'hidden', width: '100%' }}>
                              <InsertDriveFileOutlinedIcon sx={{ fontSize: 30 }} />
                              <Typography sx={{ fontSize: 9, lineHeight: 1.2, mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {att.name}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Tooltip>
                      {!readOnly && (
                        <Tooltip title="Remove">
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveAttachment(att.url)}
                            sx={{ position: 'absolute', top: 2, right: 2, p: 0.25, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' } }}
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  ))}
                  {!readOnly && (
                    <Tooltip title="Add file">
                      <Box
                        onClick={() => attachInputRef.current?.click()}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 96, height: 96, borderRadius: 1, cursor: 'pointer',
                          border: '1px dashed', borderColor: 'divider', color: 'text.secondary',
                          '&:hover': { borderColor: '#4573d2', color: '#4573d2' },
                        }}
                      >
                        {uploadingAttachment ? <CircularProgress size={22} /> : <AddIcon />}
                      </Box>
                    </Tooltip>
                  )}
                  <input ref={attachInputRef} type="file" hidden
                    onChange={e => { handleAddAttachment(e.target.files?.[0]); e.target.value = ''; }} />
                </Box>
                <Divider sx={{ my: 2 }} />
              </>
              );
            })()}

            {/* Subtasks */}
            <CardSubtasks cardId={card._id} subtasks={subtasks} onChange={setSubtasks} />

            <Divider sx={{ my: 2 }} />

            {/* Comments */}
            <CardComments cardId={card._id} comments={comments} onChange={setComments} />
            </Box>
          </Box>

          {/* Move to another project */}
          <Dialog open={moveOpen} onClose={() => setMoveOpen(false)} fullWidth maxWidth="xs">
            <DialogTitle>Move to another project</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                <InputLabel>Project</InputLabel>
                <Select
                  label="Project"
                  value={targetBoardId}
                  onChange={e => handleTargetBoardChange(e.target.value)}
                >
                  {boards
                    .filter(b => b._id?.toString() !== board?._id?.toString())
                    .map(b => <MenuItem key={b._id} value={b._id.toString()}>{b.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth disabled={!targetBoardId}>
                <InputLabel>Column</InputLabel>
                <Select
                  label="Column"
                  value={targetColumnId}
                  onChange={e => setTargetColumnId(e.target.value)}
                >
                  {targetColumns.map(col => (
                    <MenuItem key={col._id} value={col._id.toString()}>{col.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMoveOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleMove} disabled={!targetColumnId || moving}>
                {moving ? 'Moving…' : 'Move'}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </Drawer>
  );
}
