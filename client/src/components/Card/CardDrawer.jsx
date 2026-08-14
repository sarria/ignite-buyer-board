import { useEffect, useState, useCallback } from 'react';
import {
  Drawer, Box, Typography, TextField, Select, MenuItem,
  FormControl, InputLabel, Divider, IconButton,
  Chip, Tooltip, Button, Menu, Autocomplete, Skeleton,
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
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import LinkIcon from '@mui/icons-material/Link';
import { getCard, updateCard, setCardFields, deleteCard, moveCardBoard, addCardAttachment, removeCardAttachment } from '../../api/cards';
import Attachments from '../common/Attachments';
import { getBoards, getBoard } from '../../api/boards';
import CardSubtasks from './CardSubtasks';
import LuminaPanel from './LuminaPanel';
import CardComments from './CardComments';
import Linkify from '../../utils/linkify';
import RichContent from '../common/RichContent';
import RichTextField from '../common/RichTextField';
import Collapsible from '../common/Collapsible';
import DueDatePicker from '../common/DueDatePicker';
import { tagSolid } from '../../utils/tagColor';

const DRAWER_WIDTH_DEFAULT = 560;
const DRAWER_WIDTH_MIN = 420;
const DRAWER_WIDTH_KEY = 'cardDrawer.width';

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

// Title display + click-to-edit, isolated with LOCAL state so typing the title
// re-renders only this small field — not the whole (heavy) drawer. Keyed by card id
// in the parent so it resets when a different card opens.
function CardTitle({ title, completed, readOnly, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  const commit = () => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== title) onSave(v);
    else setValue(title);
  };

  if (editing && !readOnly) {
    return (
      <TextField
        autoFocus fullWidth size="small"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setValue(title); setEditing(false); }
        }}
        variant="standard"
        slotProps={{ input: { style: { fontSize: 20, fontWeight: 700, lineHeight: 1.3 } } }}
      />
    );
  }
  return (
    <Typography
      fontWeight={700}
      onClick={() => { if (!readOnly) setEditing(true); }}
      sx={{
        fontSize: 20, lineHeight: 1.3,
        cursor: readOnly ? 'default' : 'text',
        // Completed = dimmed, not struck through (matches Asana + CardFace/CardSubtasks).
        color: completed ? 'text.disabled' : 'text.primary',
        '&:hover': { bgcolor: readOnly ? 'transparent' : 'action.hover', borderRadius: 1 },
        px: 0.5, mx: -0.5,
      }}
    >
      {title}
    </Typography>
  );
}

export default function CardDrawer({ cardId, open, onClose, board, columns, fields, users, templates = [], allTags = [], onCardUpdate, onCardDelete, onCardMove }) {
  const [card, setCard] = useState(null);
  const [comments, setComments] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  // Custom fields the user revealed on this card despite having no value yet.
  const [extraFieldIds, setExtraFieldIds] = useState([]);
  const [addFieldAnchor, setAddFieldAnchor] = useState(null);
  const [editingTags, setEditingTags] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(DRAWER_WIDTH_KEY), 10);
      return Number.isFinite(v) ? Math.max(DRAWER_WIDTH_MIN, v) : DRAWER_WIDTH_DEFAULT;
    } catch { return DRAWER_WIDTH_DEFAULT; }
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !cardId) return;
    setLoading(true);
    getCard(cardId)
      .then(data => {
        setCard(data);
        setComments(data.comments || []);
        setSubtasks(data.subtasks || []);
        setExtraFieldIds([]);
      })
      .finally(() => setLoading(false));
  }, [cardId, open]);

  // Drag the drawer's left edge to resize; width persisted across sessions.
  useEffect(() => {
    if (!resizing) return undefined;
    const onMove = (e) => {
      const max = Math.max(DRAWER_WIDTH_MIN, window.innerWidth - 80);
      setDrawerWidth(Math.min(max, Math.max(DRAWER_WIDTH_MIN, window.innerWidth - e.clientX)));
    };
    const onUp = () => setResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [resizing]);

  useEffect(() => {
    try { localStorage.setItem(DRAWER_WIDTH_KEY, String(drawerWidth)); } catch { /* ignore */ }
  }, [drawerWidth]);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/boards/${board?._id}?card=${card?._id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

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

  // Attachments (standalone files, any type). The upload itself lives in <Attachments>;
  // this only persists the finished descriptor.
  const handleAddAttachment = async (att) => {
    const updated = await addCardAttachment(card._id, att);
    setCard(prev => ({ ...prev, attachments: updated.attachments }));
    onCardUpdate?.(updated);
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
            width: fullscreen ? '100vw' : { xs: '100%', sm: drawerWidth },
            p: 0,
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100%',
            maxWidth: '100vw',
            transition: resizing ? 'none' : 'width 0.2s',
          },
        },
      }}
    >
      {loading || !card ? (
        // Skeleton frame so the drawer appears instantly, then fills in.
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flexShrink: 0, px: 3, pt: 1.5, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Skeleton variant="rounded" width={120} height={30} />
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="circular" width={26} height={26} />
                ))}
              </Box>
            </Box>
            <Skeleton variant="text" width="65%" sx={{ fontSize: 24 }} />
          </Box>
          <Box sx={{ flex: 1, px: 3, py: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 2, py: 0.75, alignItems: 'center' }}>
                <Skeleton variant="text" width={80} />
                <Skeleton variant="rounded" height={32} sx={{ flex: 1 }} />
              </Box>
            ))}
            <Skeleton variant="text" width={80} sx={{ mt: 2 }} />
            <Skeleton variant="rounded" height={90} sx={{ mt: 1 }} />
          </Box>
        </Box>
      ) : (
        <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: card.isArchived ? 0.75 : 1 }}>
          {/* Drag-to-resize handle (left edge; hidden in full screen) */}
          {!fullscreen && (
            <Box
              onMouseDown={() => setResizing(true)}
              sx={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
                cursor: 'col-resize', zIndex: 20,
                bgcolor: resizing ? 'rgba(69,115,210,0.6)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(69,115,210,0.6)' },
                transition: 'background-color 0.15s',
              }}
            />
          )}
          {/* Header (pinned): actions row on top (right-aligned), title below */}
          <Box sx={{ flexShrink: 0, px: 3, pt: 1.5, pb: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Action buttons: Mark complete on the left, icons on the right */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* Mark complete / incomplete — always interactive (the escape hatch);
                  hidden for archived cards, which are managed via unarchive. */}
              {!card.isArchived && (
                <Button
                  size="small"
                  variant={card.isCompleted ? 'contained' : 'outlined'}
                  startIcon={card.isCompleted ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
                  onClick={() => saveField({ isCompleted: !card.isCompleted })}
                  sx={card.isCompleted
                    ? { bgcolor: '#4caf50', '&:hover': { bgcolor: '#43a047' } }
                    : { color: 'text.secondary', borderColor: 'divider', '&:hover': { borderColor: '#4caf50', color: '#4caf50' } }}
                >
                  {card.isCompleted ? 'Completed' : 'Mark complete'}
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              <Tooltip title={copied ? 'Copied!' : 'Copy link to this card'}>
                <IconButton onClick={handleCopyLink} size="small" sx={{ color: copied ? 'primary.main' : 'text.secondary' }}>
                  <LinkIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={fullscreen ? 'Exit full screen' : 'Full screen'}>
                <IconButton onClick={() => setFullscreen(f => !f)} size="small" sx={{ color: 'text.secondary' }}>
                  {fullscreen ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
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
                <IconButton onClick={handleArchiveToggle} size="small" sx={{ color: card.isArchived ? 'primary.main' : 'text.secondary' }}>
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
            {/* Title */}
            <Box>
              <CardTitle
                key={card._id}
                title={card.title}
                completed={card.isCompleted}
                readOnly={readOnly}
                onSave={(t) => saveField({ title: t })}
              />
            </Box>
          </Box>

          {(card.isArchived || card.isCompleted) && (
            <Box sx={{ flexShrink: 0, px: 3, py: 1, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                {card.isArchived
                  ? 'This card is archived. Unarchive to make changes.'
                  : 'This card is completed. Mark incomplete to edit.'}
              </Typography>
            </Box>
          )}

          {/* Body (scrolls) */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2 }}>
            {/* Editable content — locked (read-only) when archived or completed.
                Links/images stay clickable so you can still read & download. */}
            <Box sx={{
              pointerEvents: readOnly ? 'none' : 'auto',
              opacity: readOnly ? 0.6 : 1,
              '& a, & img': { pointerEvents: 'auto' },
              // Asana-like fields: outlined border hidden until hover; blue on focus.
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
            }}>
            {/* Core fields */}
            <FieldRow label="Column">
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
              <DueDatePicker
                value={card.dueDate}
                readOnly={readOnly}
                onChange={v => saveField({ dueDate: v })}
              />
            </FieldRow>

            {/* Tags — Asana-style combobox: type to filter, pick existing, or create new */}
            <FieldRow label="Tags">
              {editingTags ? (
              <Autocomplete
                multiple
                freeSolo
                openOnFocus
                onBlur={() => setEditingTags(false)}
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
                  const c = tagSolid(option);
                  return <li key={key} {...rest}><Chip label={option} size="small" style={tagChipStyle(c)} sx={tagChipSx} /></li>;
                }}
                renderTags={(value, getTagProps) =>
                  value.map((tag, index) => {
                    const c = tagSolid(tag);
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
                  <TextField {...params} autoFocus variant="standard" placeholder="Add or remove tags…" />
                )}
              />
              ) : (
                <Box
                  onClick={() => { if (!readOnly) setEditingTags(true); }}
                  sx={{
                    display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center',
                    minHeight: 34, px: 0.5, py: 0.5, borderRadius: 1,
                    cursor: readOnly ? 'default' : 'pointer',
                    '&:hover': { bgcolor: readOnly ? 'transparent' : 'action.hover' },
                  }}
                >
                  {(card.tags || []).length ? (card.tags || []).map(tag => {
                    const c = tagSolid(tag);
                    return (
                      <Box
                        key={tag}
                        style={{ backgroundColor: c.bg, color: c.text }}
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.25,
                          fontWeight: 600, fontSize: 11, height: 22, borderRadius: '11px',
                          pl: 1, pr: readOnly ? 1 : 0.25, maxWidth: '100%',
                        }}
                      >
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</Box>
                        {!readOnly && (
                          <CloseIcon
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = (card.tags || []).filter(t => t !== tag);
                              setCard(prev => ({ ...prev, tags: next }));
                              saveField({ tags: next });
                            }}
                            sx={{ fontSize: 15, cursor: 'pointer', color: c.text, opacity: 0.55, '&:hover': { opacity: 0.9 } }}
                          />
                        )}
                      </Box>
                    );
                  }) : (
                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>Add tags…</Typography>
                  )}
                </Box>
              )}
            </FieldRow>

            {/* Custom fields — show only those with a value (or ones the user added).
                EXCEPT Health: it is the field buyers set most, and hiding it until it
                already has a value means there is no way to set it in the first place
                without hunting through "+ Add field". It always shows. */}
            {fields
              .filter(field => field.name === 'Health'
                || hasFieldValue(field._id)
                || extraFieldIds.includes(field._id.toString()))
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
              // Health is always on screen, so it must not also be offered here.
              const addable = fields.filter(f => f.name !== 'Health'
                && !hasFieldValue(f._id) && !extraFieldIds.includes(f._id.toString()));
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

            {/* Lumina — attach a line item; data is re-pulled live on every open */}
            <LuminaPanel
              key={`lumina-${card._id}`}
              lumina={card.lumina}
              boardId={card.boardId}
              readOnly={readOnly}
              onChange={l => saveField({ lumina: l })}
            />

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
                  // Keep the "See more" fade (--fade-bg) in sync with this box's
                  // background, incl. hover, so it always matches in any theme.
                  '--fade-bg': theme => theme.palette.background.paper,
                  '&:hover': readOnly ? {} : {
                    bgcolor: theme => (theme.palette.mode === 'dark' ? '#3a3a3a' : '#f5f5f5'),
                    '--fade-bg': theme => (theme.palette.mode === 'dark' ? '#3a3a3a' : '#f5f5f5'),
                  },
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
            <Attachments
              attachments={card.attachments}
              readOnly={readOnly}
              onAdd={handleAddAttachment}
              onRemove={handleRemoveAttachment}
            />
            {((card.attachments || []).some(a => !a.inline) || !readOnly) && <Divider sx={{ my: 2 }} />}

            {/* Subtasks */}
            <CardSubtasks
              cardId={card._id}
              subtasks={subtasks}
              onChange={setSubtasks}
              users={users}
              parentTitle={card.title}
              readOnly={readOnly}
            />

            <Divider sx={{ my: 2 }} />

            {/* Comments */}
            <CardComments cardId={card._id} comments={comments} onChange={setComments} luminaLinked={!!card.lumina?.lineitemId} />
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
