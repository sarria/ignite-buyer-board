import { useMemo, useState } from 'react';
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
import { getCard } from '../../api/cards';
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

export default function ListView({
  cards, columns = [], fields = [], users = [], selectedCardId,
  onCardClick, onToggleComplete, onAddCard,
}) {
  const [collapsed, setCollapsed] = useState({});     // columnId -> true
  const [expanded, setExpanded] = useState({});       // cardId -> true
  const [subtasks, setSubtasks] = useState({});       // cardId -> [] | 'loading'
  const [addingIn, setAddingIn] = useState(null);     // columnId
  const [draft, setDraft] = useState('');

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

        {columns.map(col => {
          const rows = byColumn[col._id] || [];
          const isCollapsed = collapsed[col._id];
          return (
            <Box key={col._id}>
              {/* Group header */}
              <Box
                onClick={() => setCollapsed(p => ({ ...p, [col._id]: !p[col._id] }))}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.75,
                  cursor: 'pointer', bgcolor: 'background.default',
                  borderBottom: '1px solid', borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                <Typography variant="subtitle2" fontWeight={700}>{col.name}</Typography>
                <Typography variant="caption" color="text.secondary">{rows.length}</Typography>
              </Box>

              {!isCollapsed && rows.map(card => {
                const done = !!card.isCompleted;
                const linked = !!(card.lumina?.lineitemId || card.lumina?.advertiserId);
                const subCount = card.subtaskCount || 0;
                const open = !!expanded[card._id];
                const kids = subtasks[card._id];
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
                        }}
                      >
                        <Cell sx={{ pl: 6 }}>
                          <CheckCircleIcon sx={{ fontSize: 15, flexShrink: 0, color: sub.isComplete ? '#4caf50' : 'action.disabled' }} />
                          <Typography variant="body2" noWrap sx={{ color: sub.isComplete ? 'text.disabled' : 'text.primary' }}>
                            {sub.title}
                          </Typography>
                        </Cell>
                        <AssigneeCell user={userById[sub.assigneeId?.toString()]} />
                        <DueCell value={sub.dueDate} />
                        {enumFields.map(f => <Cell key={f._id} />)}
                      </Box>
                    ))}
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
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
