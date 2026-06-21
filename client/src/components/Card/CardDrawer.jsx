import { useEffect, useState, useCallback } from 'react';
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
import { getCard, updateCard, setCardFields, deleteCard, moveCardBoard } from '../../api/cards';
import { getBoards, getBoard } from '../../api/boards';
import CardSubtasks from './CardSubtasks';
import CardComments from './CardComments';
import Linkify from '../../utils/linkify';
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
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 }, p: 0 } } }}
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
              {editingTitle && !card.isArchived ? (
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
                  onClick={() => { if (!card.isArchived) setEditingTitle(true); }}
                  sx={{ cursor: card.isArchived ? 'default' : 'text', '&:hover': { bgcolor: card.isArchived ? 'transparent' : 'action.hover', borderRadius: 1 }, px: 0.5, mx: -0.5 }}
                >
                  {card.title}
                </Typography>
              )}
            </Box>
            {!card.isArchived && templates.length > 0 && (
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
            {!card.isArchived && (
              <Tooltip title="Move to another project">
                <IconButton onClick={openMove} size="small" sx={{ color: 'text.secondary' }}>
                  <DriveFileMoveOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={card.isArchived ? 'Unarchive card' : 'Archive card'}>
              <IconButton onClick={handleArchiveToggle} size="small" sx={{ color: card.isArchived ? '#f06a6a' : 'text.secondary' }}>
                {card.isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            {isCardEmpty && !card.isArchived && (
              <Tooltip title="Delete card">
                <IconButton onClick={handleDelete} size="small" sx={{ color: 'error.main' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
          </Box>

          {card.isArchived && (
            <Box sx={{ px: 3, py: 1, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">This card is archived. Unarchive to make changes.</Typography>
            </Box>
          )}

          {/* Body */}
          <Box sx={{ px: 3, py: 2, flex: 1, pointerEvents: card.isArchived ? 'none' : 'auto' }}>
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
            {editingDesc && !card.isArchived ? (
              <TextField
                autoFocus
                multiline
                minRows={3}
                fullWidth
                size="small"
                defaultValue={card.description || ''}
                onBlur={e => {
                  if (e.target.value !== card.description) saveField({ description: e.target.value });
                  setEditingDesc(false);
                }}
                placeholder="Add a description…"
              />
            ) : (
              <Typography
                variant="body2"
                onClick={() => { if (!card.isArchived) setEditingDesc(true); }}
                sx={{
                  whiteSpace: 'pre-wrap',
                  minHeight: 48,
                  p: 1,
                  borderRadius: 1,
                  cursor: card.isArchived ? 'default' : 'text',
                  color: card.description ? 'text.primary' : 'text.disabled',
                  '&:hover': { bgcolor: card.isArchived ? 'transparent' : 'action.hover' },
                }}
              >
                {card.description ? <Linkify text={card.description} /> : 'Add a description…'}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Subtasks */}
            <CardSubtasks cardId={card._id} subtasks={subtasks} onChange={setSubtasks} />

            <Divider sx={{ my: 2 }} />

            {/* Comments */}
            <CardComments cardId={card._id} comments={comments} onChange={setComments} />
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
