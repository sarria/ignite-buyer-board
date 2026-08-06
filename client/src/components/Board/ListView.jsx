import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Avatar, Tooltip, IconButton, Chip, TextField, CircularProgress,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { getCard } from '../../api/cards';
import { createSubtask, updateSubtask, deleteSubtask } from '../../api/subtasks';
import SubtaskDialog from '../Card/SubtaskDialog';
import { reorderColumns } from '../../api/columns';
import { formatDueRelative, dueExact, isOverdue, isToday } from '../../utils/dueDate';
import { userColor } from '../../utils/userColor';
import { tagColor } from '../../utils/tagColor';

// Asana's List view: one flat table grouped by column (Asana's "sections"), collapsible,
// with the board's enum custom fields as extra columns. A row expands to show its
// subtasks inline.
//
// Deliberately a CSS grid rather than <table>: the header, every card row and every
// subtask row share one `GRID` template, which is what keeps columns aligned across
// groups without measuring anything.

const HEALTH_COLORS = {
  'Good': '#4caf50',
  'Ok': '#ff9800',
  'Needs Work': '#f44336',
  'Waiting on DCM': '#2196f3',
};

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

function Cell({ children, sx }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0,
      px: 1.5, borderRight: '1px solid', borderColor: 'divider', ...sx,
    }}>
      {children}
    </Box>
  );
}

function AssigneeCell({ user }) {
  if (!user) return <Cell><Typography variant="caption" color="text.disabled">—</Typography></Cell>;
  return (
    <Cell>
      <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: userColor(user), flexShrink: 0 }}>
        {initials(user.name)}
      </Avatar>
      <Typography variant="body2" noWrap>{user.name}</Typography>
    </Cell>
  );
}

function DueCell({ value }) {
  if (!value) return <Cell><Typography variant="caption" color="text.disabled">—</Typography></Cell>;
  const overdue = isOverdue(value);
  return (
    <Cell>
      <Tooltip title={dueExact(value)}>
        <Typography
          variant="body2"
          noWrap
          sx={{ color: overdue ? 'error.main' : 'text.primary', fontWeight: overdue || isToday(value) ? 600 : 400 }}
        >
          {formatDueRelative(value)}
        </Typography>
      </Tooltip>
    </Cell>
  );
}

function EnumCell({ field, card }) {
  const v = card.fieldValues?.find(x => x.fieldId?.toString() === field._id?.toString())?.valueEnum;
  if (!v) return <Cell />;
  const color = HEALTH_COLORS[v];
  return (
    <Cell>
      <Chip
        size="small"
        label={v}
        sx={{
          height: 20, fontSize: 11, fontWeight: 600,
          bgcolor: color || 'action.selected',
          color: color ? '#fff' : 'text.primary',
        }}
      />
    </Cell>
  );
}

// A group (board column) — draggable by the handle that appears on hover, so the list can
// be reordered the same way the board's columns can. Same dnd-kit + reorderColumns path as
// board settings, so the three surfaces can't disagree about order.
function Group({ col, children, collapsed, onToggle, count }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col._id });
  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ opacity: isDragging ? 0.5 : 1, '&:hover .grp-handle': { opacity: 1 } }}
    >
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.75,
          cursor: 'pointer', bgcolor: 'background.default',
          borderBottom: '1px solid', borderColor: 'divider',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box
          className="grp-handle"
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          sx={{ display: 'flex', opacity: 0, transition: 'opacity .12s', cursor: 'grab', color: 'text.disabled' }}
        >
          <DragIndicatorIcon sx={{ fontSize: 16 }} />
        </Box>
        {collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        <Typography variant="subtitle2" fontWeight={700}>{col.name}</Typography>
        <Typography variant="caption" color="text.secondary">{count}</Typography>
      </Box>
      {children}
    </Box>
  );
}

export default function ListView({
  cards, columns = [], fields = [], users = [], selectedCardId,
  onCardClick, onToggleComplete, onAddCard, onReorderColumns, boardId, addSignal = 0,
}) {
  const [collapsed, setCollapsed] = useState({});     // columnId -> true
  const [expanded, setExpanded] = useState({});       // cardId -> true
  const [subtasks, setSubtasks] = useState({});       // cardId -> [] | 'loading'
  const [addingIn, setAddingIn] = useState(null);     // columnId
  const [draft, setDraft] = useState('');

  // Header "Add task" opens the composer in the first expanded group.
  useEffect(() => {
    if (!addSignal) return;
    const first = columns.find(c => !collapsed[c._id]) || columns[0];
    if (first) { setAddingIn(first._id); setDraft(''); }
  }, [addSignal]);   // eslint-disable-line react-hooks/exhaustive-deps

  const enumFields = useMemo(() => fields.filter(f => f.type === 'enum'), [fields]);
  const userById = useMemo(
    () => Object.fromEntries(users.map(u => [u._id?.toString(), u])), [users]
  );

  // Name column flexes; the rest are fixed so they line up across every group.
  const GRID = `minmax(280px, 1fr) 190px 140px ${enumFields.map(() => '140px').join(' ')}`;

  const byColumn = useMemo(() => {
    const map = {};
    for (const col of columns) map[col._id] = [];
    for (const card of cards) {
      const key = card.columnId?.toString();
      if (map[key]) map[key].push(card);
    }
    return map;
  }, [cards, columns]);

  // Subtasks aren't in the card list payload, so fetch on first expand. getCard returns
  // them alongside comments — one request per row you actually open.
  const toggleExpand = async (card) => {
    const id = card._id;
    setExpanded(p => ({ ...p, [id]: !p[id] }));
    if (subtasks[id] || expanded[id]) return;
    setSubtasks(p => ({ ...p, [id]: 'loading' }));
    try {
      const full = await getCard(id);
      setSubtasks(p => ({ ...p, [id]: full.subtasks || [] }));
    } catch {
      setSubtasks(p => ({ ...p, [id]: [] }));
    }
  };

  // Adding a subtask from an expanded row, so the list can grow a checklist without
  // opening the card.
  const [addingSubIn, setAddingSubIn] = useState(null);   // cardId
  const [subDraft, setSubDraft] = useState('');
  // A subtask row behaves like the drawer's: tick to complete, click the title to open the
  // SAME SubtaskDialog, delete on hover. Anything less makes the list a dead end where you
  // can see a subtask but not act on it.
  const [openSub, setOpenSub] = useState(null);           // { cardId, subtaskId }

  const replaceSub = (cardId, updated) => setSubtasks(p => ({
    ...p,
    [cardId]: (Array.isArray(p[cardId]) ? p[cardId] : []).map(s => (s._id === updated._id ? updated : s)),
  }));
  const patchSub = async (cardId, id, data) => replaceSub(cardId, await updateSubtask(id, data));
  const removeSub = async (cardId, id) => {
    await deleteSubtask(id);
    setSubtasks(p => ({
      ...p,
      [cardId]: (Array.isArray(p[cardId]) ? p[cardId] : []).filter(s => s._id !== id),
    }));
    setOpenSub(null);
  };
  const commitSub = async (cardId) => {
    const title = subDraft.trim();
    setSubDraft('');
    if (!title) { setAddingSubIn(null); return; }
    const created = await createSubtask(cardId, { title });
    setSubtasks(p => ({ ...p, [cardId]: [...(Array.isArray(p[cardId]) ? p[cardId] : []), created] }));
    setAddingSubIn(cardId);
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const handleGroupDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex(c => c._id === active.id);
    const newIndex = columns.findIndex(c => c._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(columns, oldIndex, newIndex);
    onReorderColumns?.(reordered);                       // optimistic
    try { await reorderColumns(boardId, reordered.map(c => c._id)); }
    catch { onReorderColumns?.(columns); }               // put it back if the save failed
  };

  const openSubCard = openSub ? cards.find(c => c._id === openSub.cardId) : null;
  const openSubtask = openSub
    ? (Array.isArray(subtasks[openSub.cardId]) ? subtasks[openSub.cardId] : [])
        .find(s => s._id === openSub.subtaskId) || null
    : null;

  const commitAdd = async (columnId) => {
    const title = draft.trim();
    setDraft('');
    if (!title) { setAddingIn(null); return; }
    await onAddCard?.(columnId, title);
    setAddingIn(columnId);   // keep going — cards are added in runs
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ minWidth: 760 }}>
        {/* Header — sticky so the columns stay labelled while you scroll a long board */}
        <Box sx={{
          display: 'grid', gridTemplateColumns: GRID,
          position: 'sticky', top: 0, zIndex: 2,
          bgcolor: 'background.paper',
          borderBottom: '1px solid', borderColor: 'divider',
          height: 38, alignItems: 'center',
        }}>
          <Cell><Typography variant="caption" fontWeight={700} color="text.secondary">Name</Typography></Cell>
          <Cell><Typography variant="caption" fontWeight={700} color="text.secondary">Assignee</Typography></Cell>
          <Cell><Typography variant="caption" fontWeight={700} color="text.secondary">Due date</Typography></Cell>
          {enumFields.map(f => (
            <Cell key={f._id}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" noWrap>{f.name}</Typography>
            </Cell>
          ))}
        </Box>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
        <SortableContext items={columns.map(c => c._id)} strategy={verticalListSortingStrategy}>
        {columns.map(col => {
          const rows = byColumn[col._id] || [];
          const isCollapsed = collapsed[col._id];
          return (
            <Group
              key={col._id}
              col={col}
              count={rows.length}
              collapsed={isCollapsed}
              onToggle={() => setCollapsed(p => ({ ...p, [col._id]: !p[col._id] }))}
            >

              {!isCollapsed && rows.map(card => {
                const done = !!card.isCompleted;
                const linked = !!(card.lumina?.lineitemId || card.lumina?.advertiserId);
                const subCount = card.subtaskCount || 0;
                const open = !!expanded[card._id];
                const kids = subtasks[card._id];
                // Same rule as the drawer: a completed or archived card's subtasks are read-only.
                const rowReadOnly = done || !!card.isArchived;
                return (
                  <Box key={card._id}>
                    <Box
                      sx={{
                        display: 'grid', gridTemplateColumns: GRID,
                        height: 40, alignItems: 'center',
                        borderBottom: '1px solid', borderColor: 'divider',
                        bgcolor: selectedCardId === card._id ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Cell>
                        {/* Caret only when there's something to expand, so an empty row
                            doesn't offer a control that does nothing. */}
                        <Box sx={{ width: 20, flexShrink: 0 }}>
                          {subCount > 0 && (
                            <IconButton size="small" sx={{ p: 0 }} onClick={() => toggleExpand(card)}>
                              {open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                          )}
                        </Box>
                        <Tooltip title={done ? 'Mark incomplete' : 'Mark complete'}>
                          <IconButton
                            size="small"
                            sx={{ p: 0, flexShrink: 0, color: done ? '#4caf50' : 'text.disabled', '&:hover': { color: '#4caf50' } }}
                            onClick={() => onToggleComplete?.(card)}
                          >
                            {done ? <CheckCircleIcon sx={{ fontSize: 17 }} /> : <CheckCircleOutlineIcon sx={{ fontSize: 17 }} />}
                          </IconButton>
                        </Tooltip>
                        <Typography
                          variant="body2"
                          noWrap
                          onClick={() => onCardClick?.(card)}
                          sx={{
                            cursor: 'pointer', minWidth: 0,
                            color: done ? 'text.disabled' : 'text.primary',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          {card.title}
                        </Typography>
                        {/* Counts sit with the name, as Asana does — they belong to the
                            task, not to a column of their own. */}
                        {linked && (
                          <Tooltip title={card.lumina?.name ? `Lumina · ${card.lumina.name}` : 'Linked to Lumina'}>
                            <LinkIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
                          </Tooltip>
                        )}
                        {subCount > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                            <CheckBoxOutlinedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">{card.subtaskDone || 0}/{subCount}</Typography>
                          </Box>
                        )}
                        {card.commentCount > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                            <ChatBubbleOutlineIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">{card.commentCount}</Typography>
                          </Box>
                        )}
                        {card.tags?.slice(0, 3).map(t => (
                          <Tooltip key={t} title={t}>
                            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tagColor(t).dot, flexShrink: 0 }} />
                          </Tooltip>
                        ))}
                      </Cell>
                      <AssigneeCell user={userById[card.assigneeId?.toString()]} />
                      <DueCell value={card.dueDate} />
                      {enumFields.map(f => <EnumCell key={f._id} field={f} card={card} />)}
                    </Box>

                    {/* Subtasks, indented under their parent */}
                    {open && kids === 'loading' && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: GRID, height: 34, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Cell sx={{ pl: 6 }}><CircularProgress size={12} /></Cell>
                      </Box>
                    )}
                    {open && Array.isArray(kids) && kids.map(sub => (
                      <Box
                        key={sub._id}
                        sx={{
                          display: 'grid', gridTemplateColumns: GRID, height: 34, alignItems: 'center',
                          borderBottom: '1px solid', borderColor: 'divider',
                          '&:hover': { bgcolor: 'action.hover' },
                          '&:hover .sub-del': { opacity: 1 },
                        }}
                      >
                        <Cell sx={{ pl: 6 }}>
                          <Tooltip title={sub.isComplete ? 'Mark incomplete' : 'Mark complete'}>
                            <span>
                              <IconButton
                                size="small"
                                disabled={rowReadOnly}
                                onClick={() => patchSub(card._id, sub._id, { isComplete: !sub.isComplete })}
                                sx={{ p: 0, flexShrink: 0, color: sub.isComplete ? '#4caf50' : 'text.disabled', '&:hover': { color: '#4caf50' } }}
                              >
                                {sub.isComplete ? <CheckCircleIcon sx={{ fontSize: 15 }} /> : <CheckCircleOutlineIcon sx={{ fontSize: 15 }} />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          {/* Title opens the detail; the tick stays its own hit target, as
                              in the drawer. */}
                          <Typography
                            variant="body2"
                            noWrap
                            onClick={() => setOpenSub({ cardId: card._id, subtaskId: sub._id })}
                            sx={{
                              flex: 1, minWidth: 0, cursor: 'pointer',
                              color: sub.isComplete ? 'text.disabled' : 'text.primary',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            {sub.title}
                          </Typography>
                          {!rowReadOnly && (
                            <IconButton
                              className="sub-del"
                              size="small"
                              onClick={() => removeSub(card._id, sub._id)}
                              sx={{ p: 0.25, flexShrink: 0, opacity: 0, transition: 'opacity .12s' }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          )}
                        </Cell>
                        <AssigneeCell user={userById[sub.assigneeId?.toString()]} />
                        <DueCell value={sub.dueDate} />
                        {enumFields.map(f => <Cell key={f._id} />)}
                      </Box>
                    ))}

                    {/* Add subtask, at the END of the expanded list — same placement as the
                        card drawer, so the affordance is where you finish reading. */}
                    {open && Array.isArray(kids) && !rowReadOnly && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: GRID, height: 34, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Cell sx={{ pl: 6 }}>
                          {addingSubIn === card._id ? (
                            <TextField
                              size="small"
                              autoFocus
                              fullWidth
                              variant="standard"
                              placeholder="Subtask title"
                              value={subDraft}
                              onChange={e => setSubDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitSub(card._id); }
                                if (e.key === 'Escape') { setSubDraft(''); setAddingSubIn(null); }
                              }}
                              onBlur={() => { setAddingSubIn(null); setSubDraft(''); }}
                              slotProps={{ input: { disableUnderline: true } }}
                            />
                          ) : (
                            <Typography
                              variant="body2"
                              onClick={() => { setAddingSubIn(card._id); setSubDraft(''); }}
                              sx={{ cursor: 'pointer', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                            >
                              Add subtask
                            </Typography>
                          )}
                        </Cell>
                      </Box>
                    )}
                  </Box>
                );
              })}

              {/* Add task at the end of each group, as Asana does */}
              {!isCollapsed && onAddCard && (
                <Box sx={{ display: 'grid', gridTemplateColumns: GRID, height: 36, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Cell>
                    {addingIn === col._id ? (
                      <TextField
                        size="small"
                        autoFocus
                        fullWidth
                        variant="standard"
                        placeholder="Card title"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitAdd(col._id); }
                          if (e.key === 'Escape') { setDraft(''); setAddingIn(null); }
                        }}
                        onBlur={() => { setAddingIn(null); setDraft(''); }}
                        slotProps={{ input: { disableUnderline: true } }}
                      />
                    ) : (
                      <Typography
                        variant="body2"
                        onClick={() => { setAddingIn(col._id); setDraft(''); }}
                        sx={{ pl: 2.5, cursor: 'pointer', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                      >
                        + Add task
                      </Typography>
                    )}
                  </Cell>
                </Box>
              )}
            </Group>
          );
        })}
        </SortableContext>
        </DndContext>
      </Box>

      {/* One dialog for the whole list — the SAME component the card drawer uses, so a
          subtask edits identically wherever you found it. */}
      <SubtaskDialog
        open={!!openSubtask}
        subtask={openSubtask}
        parentTitle={openSubCard?.title}
        users={users}
        readOnly={!!(openSubCard?.isCompleted || openSubCard?.isArchived)}
        onSave={data => patchSub(openSub.cardId, openSub.subtaskId, data)}
        onReplace={updated => replaceSub(openSub.cardId, updated)}
        onDelete={() => removeSub(openSub.cardId, openSub.subtaskId)}
        onClose={() => setOpenSub(null)}
      />
    </Box>
  );
}
