import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Tooltip, IconButton, TextField, CircularProgress, Skeleton,
  Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { getCard } from '../../api/cards';
import { createSubtask, updateSubtask, deleteSubtask } from '../../api/subtasks';
import SubtaskDialog from '../Card/SubtaskDialog';
import CompleteToggle from '../common/CompleteToggle';
import AssigneeControl from '../common/AssigneeControl';
import DueDatePicker from '../common/DueDatePicker';
import EnumFieldControl from '../common/EnumFieldControl';
import { reorderColumns } from '../../api/columns';
import { tagColor } from '../../utils/tagColor';
import { sortCards, SORT_NONE } from '../../utils/cardSort';

// Asana's List view: one flat table grouped by column (Asana's "sections"), collapsible,
// with the board's enum custom fields as extra columns. A row expands to show its
// subtasks inline.
//
// Deliberately a CSS grid rather than <table>: the header, every card row and every
// subtask row share one `GRID` template, which is what keeps columns aligned across
// groups without measuring anything.

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

// Both cells are editable in place — assigning and dating is most of what a list view is
// for, and bouncing to the drawer for it defeats the point of the row.
function AssigneeCell({ user, users, onChange, readOnly }) {
  return (
    <Cell>
      <AssigneeControl
        value={user?._id}
        users={users}
        readOnly={readOnly}
        onChange={onChange}
        size={22}
      />
      {user && <Typography variant="body2" noWrap>{user.name}</Typography>}
    </Cell>
  );
}

function DueCell({ value, onChange, readOnly }) {
  return (
    <Cell>
      <DueDatePicker compact size={22} value={value} readOnly={readOnly} onChange={onChange} />
    </Cell>
  );
}

function EnumCell({ field, card, onChange, readOnly }) {
  const v = card.fieldValues?.find(x => x.fieldId?.toString() === field._id?.toString())?.valueEnum;
  return (
    <Cell>
      <EnumFieldControl field={field} value={v || ''} readOnly={readOnly} onChange={onChange} />
    </Cell>
  );
}

// A header cell that can drive the shared sort state — a hover-revealed sort glyph next
// to the label (there was previously no hint at all that a header was clickable), opening
// a tiny menu of Ascending / Descending. Mirrors the top-bar Sort button's fields so the
// two can't disagree; clicking a header is just a shortcut into the same state.
function SortableHeaderCell({ label, sortKey, sortBy, sortDir, onSortChange, sx }) {
  const [anchor, setAnchor] = useState(null);
  const active = sortBy === sortKey;
  const pick = (dir) => { onSortChange?.(sortKey, dir); setAnchor(null); };
  return (
    <Cell sx={{ '&:hover .sort-hdr-btn': { opacity: 1 }, ...sx }}>
      <Typography
        variant="caption" fontWeight={700}
        color={active ? 'primary.main' : 'text.secondary'}
        noWrap sx={{ flex: 1, minWidth: 0 }}
      >
        {label}
      </Typography>
      {onSortChange && (
        <IconButton
          className="sort-hdr-btn"
          size="small"
          onClick={e => setAnchor(e.currentTarget)}
          sx={{ p: 0.25, opacity: active ? 1 : 0, transition: 'opacity .12s', flexShrink: 0, color: active ? 'primary.main' : 'text.secondary' }}
        >
          {active
            ? (sortDir === 'desc' ? <ArrowDownwardIcon sx={{ fontSize: 14 }} /> : <ArrowUpwardIcon sx={{ fontSize: 14 }} />)
            : <ImportExportIcon sx={{ fontSize: 14 }} />}
        </IconButton>
      )}
      <Menu
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        transitionDuration={0}
      >
        <MenuItem dense selected={active && sortDir === 'asc'} onClick={() => pick('asc')}>
          <ListItemIcon sx={{ minWidth: 28 }}><ArrowUpwardIcon sx={{ fontSize: 15 }} /></ListItemIcon>
          <ListItemText>Sort ascending</ListItemText>
        </MenuItem>
        <MenuItem dense selected={active && sortDir === 'desc'} onClick={() => pick('desc')}>
          <ListItemIcon sx={{ minWidth: 28 }}><ArrowDownwardIcon sx={{ fontSize: 15 }} /></ListItemIcon>
          <ListItemText>Sort descending</ListItemText>
        </MenuItem>
        {active && (
          <MenuItem dense onClick={() => pick(SORT_NONE)}>
            <ListItemIcon sx={{ minWidth: 28 }} />
            <ListItemText>Clear sort</ListItemText>
          </MenuItem>
        )}
      </Menu>
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
        {count !== null && <Typography variant="caption" color="text.secondary">{count}</Typography>}
      </Box>
      {children}
    </Box>
  );
}

// Stands in for a group's rows while cards are still loading, so an empty group doesn't
// read as "this column has nothing in it" — same intent as the board view's card
// skeletons (BoardColumn), just row-shaped instead of card-shaped.
function SkeletonRow({ gridTemplate }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: gridTemplate, height: 40, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Cell><Skeleton variant="text" width="60%" /></Cell>
      <Cell><Skeleton variant="circular" width={22} height={22} /></Cell>
      <Cell><Skeleton variant="text" width="70%" /></Cell>
    </Box>
  );
}

export default function ListView({
  cards, columns = [], fields = [], users = [], selectedCardId, loadingCards = false,
  onCardClick, onToggleComplete, onCardPatch, onCardFieldChange, onAddCard, onReorderColumns, boardId, addSignal = 0,
  sortBy = SORT_NONE, sortDir = 'asc', onSortChange,
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
    if (sortBy !== SORT_NONE) {
      for (const key of Object.keys(map)) {
        map[key] = sortCards(map[key], sortBy, sortDir, { users, enumFields });
      }
    }
    return map;
  }, [cards, columns, sortBy, sortDir, users, enumFields]);

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
        {/* Header — sticky so the columns stay labelled while you scroll a long board.
            Assignee / Due date / enum fields double as sort shortcuts into the same
            state the top-bar Sort button drives — a hover-revealed glyph is the only
            hint, same discoverability trade-off Asana makes. */}
        <Box sx={{
          display: 'grid', gridTemplateColumns: GRID,
          position: 'sticky', top: 0, zIndex: 2,
          bgcolor: 'background.paper',
          borderBottom: '1px solid', borderColor: 'divider',
          height: 38, alignItems: 'center',
        }}>
          <Cell><Typography variant="caption" fontWeight={700} color="text.secondary">Name</Typography></Cell>
          <SortableHeaderCell label="Assignee" sortKey="assignee" sortBy={sortBy} sortDir={sortDir} onSortChange={onSortChange} />
          <SortableHeaderCell label="Due date" sortKey="dueDate" sortBy={sortBy} sortDir={sortDir} onSortChange={onSortChange} />
          {enumFields.map(f => (
            <SortableHeaderCell
              key={f._id}
              label={f.name}
              sortKey={`enum:${f._id}`}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={onSortChange}
            />
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
              count={loadingCards ? null : rows.length}
              collapsed={isCollapsed}
              onToggle={() => setCollapsed(p => ({ ...p, [col._id]: !p[col._id] }))}
            >

              {!isCollapsed && loadingCards && (
                <SkeletonRow gridTemplate={GRID} />
              )}

              {!isCollapsed && !loadingCards && rows.map(card => {
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
                        <CompleteToggle done={done} onToggle={() => onToggleComplete?.(card)} />
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
                      <AssigneeCell
                        user={userById[card.assigneeId?.toString()]}
                        users={users}
                        readOnly={rowReadOnly}
                        onChange={id => onCardPatch?.(card, { assigneeId: id })}
                      />
                      <DueCell
                        value={card.dueDate}
                        readOnly={rowReadOnly}
                        onChange={v => onCardPatch?.(card, { dueDate: v })}
                      />
                      {enumFields.map(f => (
                        <EnumCell
                          key={f._id}
                          field={f}
                          card={card}
                          readOnly={rowReadOnly}
                          onChange={v => onCardFieldChange?.(card, f._id, v)}
                        />
                      ))}
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
                          <CompleteToggle
                            done={!!sub.isComplete}
                            disabled={rowReadOnly}
                            onToggle={() => patchSub(card._id, sub._id, { isComplete: !sub.isComplete })}
                            size={16}
                          />
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
                        <AssigneeCell
                          user={userById[sub.assigneeId?.toString()]}
                          users={users}
                          readOnly={rowReadOnly}
                          onChange={id => patchSub(card._id, sub._id, { assigneeId: id })}
                        />
                        <DueCell
                          value={sub.dueDate}
                          readOnly={rowReadOnly}
                          onChange={v => patchSub(card._id, sub._id, { dueDate: v })}
                        />
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
              {!isCollapsed && !loadingCards && onAddCard && (
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
