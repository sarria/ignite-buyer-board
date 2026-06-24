import { useEffect, useState, useCallback, useMemo, useTransition } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, TextField,
  Select, MenuItem, FormControl, Tooltip, IconButton, Chip, Divider, Skeleton,
} from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SettingsIcon from '@mui/icons-material/Settings';
import ArchiveIcon from '@mui/icons-material/Archive';
import SearchIcon from '@mui/icons-material/Search';
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors,
  DragOverlay, closestCorners, PointerSensor,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import BoardColumn from '../components/Board/BoardColumn';
import BoardCard from '../components/Board/BoardCard';
import CardDrawer from '../components/Card/CardDrawer';
import { getBoard } from '../api/boards';
import { getCards, createCard, moveCard, reorderCards } from '../api/cards';
import { reorderColumns } from '../api/columns';
import { getTemplates, applyTemplate } from '../api/templates';
import api from '../api/client';
import { useApp } from '../context/AppContext';
import { setLastBoardId, clearLastBoardId } from '../utils/lastBoard';

// Placeholder column shown while the board frame (columns) is still loading.
function SkeletonColumn() {
  return (
    <Box sx={{ minWidth: 280, maxWidth: 280, mx: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Skeleton variant="rounded" height={44} sx={{ mb: 1, borderRadius: 1.5 }} />
      <Box sx={{ flex: 1, bgcolor: theme => (theme.palette.mode === 'dark' ? '#242424' : '#f1f1f1'), borderRadius: 1.5, p: 1, overflow: 'hidden' }}>
        {Array.from({ length: Math.ceil(window.innerHeight / 156) }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={144} sx={{ mb: 1.5, borderRadius: 1.5 }} />
        ))}
      </Box>
    </Box>
  );
}

export default function BoardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useApp();

  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [cards, setCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [completedFilter, setCompletedFilter] = useState('incomplete'); // incomplete | all | completed
  const [activeCard, setActiveCard] = useState(null);
  const [activeColumnId, setActiveColumnId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Drawer open state is LOCAL (instant open/close) but mirrored to the URL
  // (?card=<id>) for deep-linking; initialized from and synced to the URL.
  const [drawerCardId, setDrawerCardId] = useState(() => searchParams.get('card'));
  const [didDrag, setDidDrag] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    // Reset so switching boards shows the new board's skeleton, not stale data.
    setLoading(true);
    setCardsLoading(true);
    setError(null);
    setBoard(null);
    setColumns([]);
    setCards([]);
    setShowArchived(false);
    setArchivedLoaded(false);

    // Board (columns + fields) drives the visible frame — load it first so the
    // top bar and columns render immediately, then the rest fills in.
    getBoard(id)
      .then(boardData => {
        if (cancelled) return;
        setBoard(boardData);
        setLastBoardId(id);
        setColumns(boardData.columns || []);
      })
      .catch(e => {
        // Board is gone or unreachable — drop the stale pointer so '/' won't loop back here.
        if (cancelled) return;
        clearLastBoardId();
        setError(e.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Cards fill in as they arrive (skeleton cards show meanwhile).
    getCards(id, { archived: 'false' })
      .then(cardsData => { if (!cancelled) setCards(cardsData); })
      .finally(() => { if (!cancelled) setCardsLoading(false); });

    // Users + templates are non-blocking (filters / template menus).
    api.get('/users').then(r => { if (!cancelled) setUsers(r.data); }).catch(() => {});
    getTemplates(id).then(t => { if (!cancelled) setTemplates(t); }).catch(() => {});

    return () => { cancelled = true; };
  }, [id]);

  // Card drawer open state lives in the URL (?card=<id>) so cards are deep-linkable
  // (copy link / refresh / back button all work).
  const openCard = useCallback((cardId) => {
    // Local state updates immediately so the drawer opens/closes without waiting on
    // the router; mirror to the URL afterwards (replace, to avoid history spam).
    setDrawerCardId(cardId ? cardId.toString() : null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (cardId) next.set('card', cardId.toString()); else next.delete('card');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Sync the drawer if the URL changes externally (deep link, back/forward).
  useEffect(() => {
    setDrawerCardId(searchParams.get('card'));
  }, [searchParams]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragStart = useCallback(({ active }) => {
    if (active.data.current?.type === 'card') {
      setActiveCard(active.data.current.card);
      setDidDrag(true);
    } else if (active.data.current?.type === 'column') {
      setActiveColumnId(active.id);
      setDidDrag(true);
    }
  }, []);

  const handleDragEnd = useCallback(async ({ active, over }) => {
    setActiveCard(null);
    setActiveColumnId(null);
    setTimeout(() => setDidDrag(false), 100);
    if (!over) return;

    const activeType = active.data.current?.type;

    if (activeType === 'column') {
      const oldIndex = columns.findIndex(c => c._id === active.id);
      const newIndex = columns.findIndex(c => c._id === over.id);
      if (oldIndex === newIndex) return;
      const reordered = arrayMove(columns, oldIndex, newIndex);
      setColumns(reordered);
      await reorderColumns(id, reordered.map(c => c._id));
      return;
    }

    if (activeType === 'card') {
      const activeCard = active.data.current.card;
      const overId = over.id;
      const overType = over.data.current?.type;

      const destColumnId = overType === 'column'
        ? over.data.current.columnId
        : overType === 'card'
          ? cards.find(c => c._id === overId)?.columnId
          : null;

      if (!destColumnId) return;

      const sourceColumnId = activeCard.columnId;
      const movingBetweenColumns = sourceColumnId?.toString() !== destColumnId?.toString();

      if (movingBetweenColumns) {
        setCards(prev => prev.map(c =>
          c._id === activeCard._id ? { ...c, columnId: destColumnId } : c
        ));
        await moveCard(activeCard._id, { columnId: destColumnId });
      } else {
        const colCards = cards.filter(c => c.columnId?.toString() === sourceColumnId?.toString());
        const oldIndex = colCards.findIndex(c => c._id === active.id);
        const newIndex = colCards.findIndex(c => c._id === overId);
        if (oldIndex === newIndex) return;

        const reordered = arrayMove(colCards, oldIndex, newIndex);
        setCards(prev => {
          const others = prev.filter(c => c.columnId?.toString() !== sourceColumnId?.toString());
          return [...others, ...reordered];
        });
        await reorderCards(id, reordered.map(c => c._id));
      }
    }
  }, [cards, columns, id]);

  const handleAddCard = useCallback(async (columnId, title) => {
    const created = await createCard(id, { columnId, title });
    setCards(prev => [...prev, created]);
    openCard(created._id); // open the new card so the user can keep filling it in
  }, [id, openCard]);

  const handleApplyTemplate = useCallback(async (template, columnId, title) => {
    const created = await applyTemplate(template._id, columnId, title);
    setCards(prev => [...prev, created]);
    openCard(created._id);
  }, [openCard]);

  const fields = board?.fields || [];
  const healthField = fields.find(f => f.name === 'Health' && f.type === 'enum');
  const healthOptions = healthField?.options || [];

  const cardsByColumn = useMemo(() => {
    const filtered = cards.filter(card => {
      if (showArchived ? !card.isArchived : card.isArchived) return false;
      // Completion filter (active board only; archive view shows everything).
      if (!showArchived) {
        if (completedFilter === 'incomplete' && card.isCompleted) return false;
        if (completedFilter === 'completed' && !card.isCompleted) return false;
      }
      if (filterAssignee && card.assigneeId?.toString() !== filterAssignee) return false;
      if (filterHealth && healthField) {
        const fv = card.fieldValues?.find(v => v.fieldId?.toString() === healthField._id?.toString());
        if (fv?.valueEnum !== filterHealth) return false;
      }
      if (search && !card.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const map = {};
    columns.forEach(col => { map[col._id] = []; });
    filtered.forEach(card => {
      const key = card.columnId?.toString();
      if (map[key]) map[key].push(card);
    });
    return map;
  }, [cards, columns, filterAssignee, filterHealth, completedFilter, search, healthField, showArchived]);

  if (error) return <Box sx={{ p: 4 }}><Typography color="error">{error}</Typography></Box>;

  const activeColumn = activeColumnId ? columns.find(c => c._id === activeColumnId) : null;

  // Compact, Asana-like toolbar controls: filled pill, border appears on hover/focus.
  const controlSx = {
    height: 34,
    borderRadius: 2,
    bgcolor: 'action.hover',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
    '& .MuiSelect-select': { display: 'flex', alignItems: 'center', py: 0, pl: 1.5 },
  };
  const filterLabel = (label, value) => (
    <Box component="span" sx={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ color: 'text.secondary' }}>{label}</Box>
      {value && <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>: {value}</Box>}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default', overflow: 'hidden' }}>
      {/* Top bar */}
      <Box sx={{
        px: 2.5, py: 1.25,
        borderBottom: '1px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 1.25,
        bgcolor: 'background.paper', flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: '1.0625rem', fontWeight: 600, whiteSpace: 'nowrap', mr: 0.25 }}>
          {board ? board.name : <Skeleton variant="text" width={180} />}
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.75, my: 0.75 }} />

        <TextField
          size="small" placeholder="Search tasks" value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 18, color: 'text.disabled', mr: 0.75 }} /> }}
          sx={{
            width: 200,
            '& .MuiOutlinedInput-root': { ...controlSx, px: 1.25 },
            '& input': { py: 0, fontSize: '0.8125rem' },
          }}
        />

        <FormControl size="small">
          <Select
            value={filterAssignee} displayEmpty
            onChange={e => setFilterAssignee(e.target.value)}
            renderValue={v => filterLabel('Assignee', users.find(u => u._id === v)?.name)}
            sx={{ ...controlSx, minWidth: 120 }}
          >
            <MenuItem value="">All assignees</MenuItem>
            {users.map(u => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
          </Select>
        </FormControl>
        {healthOptions.length > 0 && (
          <FormControl size="small">
            <Select
              value={filterHealth} displayEmpty
              onChange={e => setFilterHealth(e.target.value)}
              renderValue={v => filterLabel('Health', v)}
              sx={{ ...controlSx, minWidth: 110 }}
            >
              <MenuItem value="">All health</MenuItem>
              {healthOptions.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {!showArchived && (
          <FormControl size="small">
            <Select
              value={completedFilter}
              onChange={e => setCompletedFilter(e.target.value)}
              renderValue={v => filterLabel('Tasks', v === 'all' ? 'All' : v === 'completed' ? 'Completed' : 'Incomplete')}
              sx={{ ...controlSx, minWidth: 110 }}
            >
              <MenuItem value="incomplete">Incomplete</MenuItem>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
            </Select>
          </FormControl>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={showArchived ? 'Hide archived cards' : 'Show archived cards'}>
            <span>
              <IconButton
                disabled={loadingArchived}
                onClick={async () => {
                  if (!showArchived && !archivedLoaded) {
                    setLoadingArchived(true);
                    try {
                      const archived = await getCards(id, { archived: 'true' });
                      setCards(prev => {
                        const activeIds = new Set(prev.map(c => c._id.toString()));
                        return [...prev, ...archived.filter(c => !activeIds.has(c._id.toString()))];
                      });
                      setArchivedLoaded(true);
                    } finally {
                      setLoadingArchived(false);
                    }
                  }
                  // Non-blocking: keep the UI responsive while the board re-renders
                  // the (potentially large) archived card set.
                  startTransition(() => setShowArchived(v => !v));
                }}
                size="small"
                sx={{ color: showArchived ? 'primary.main' : 'text.secondary' }}
              >
                {loadingArchived || isPending ? <CircularProgress size={18} color="inherit" /> : <ArchiveIcon />}
              </IconButton>
            </span>
          </Tooltip>
          {showArchived && (
            <Chip label="Showing archived" size="small" sx={{ bgcolor: '#4573d222', color: 'primary.main', fontWeight: 600 }} />
          )}
          <Tooltip title="Board settings">
            <IconButton onClick={() => navigate(`/boards/${id}/settings`)} size="small">
              <SettingsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
            <IconButton onClick={toggleTheme} size="small">
              {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columns.map(c => c._id)} strategy={horizontalListSortingStrategy}>
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'stretch', p: 2 }}>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonColumn key={i} />)
              : columns.map(col => (
                <BoardColumn
                  key={col._id}
                  column={col}
                  cards={cardsByColumn[col._id] || []}
                  fields={fields}
                  users={users}
                  selectedCardId={drawerCardId}
                  onCardClick={card => { if (!didDrag) openCard(card._id); }}
                  onAddCard={handleAddCard}
                  onApplyTemplate={handleApplyTemplate}
                  templates={templates}
                  showArchived={showArchived}
                  loadingCards={cardsLoading}
                />
              ))}
          </Box>
        </SortableContext>

        <DragOverlay>
          {activeCard && (
            <BoardCard card={activeCard} fields={fields} users={users} onClick={() => {}} />
          )}
          {activeColumn && (
            <BoardColumn
              column={activeColumn}
              cards={cardsByColumn[activeColumn._id] || []}
              fields={fields}
              users={users}
              onCardClick={() => {}}
              onAddCard={() => {}}
              onApplyTemplate={() => {}}
              templates={[]}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>

      <CardDrawer
        cardId={drawerCardId}
        open={!!drawerCardId}
        onClose={() => openCard(null)}
        board={board}
        columns={columns}
        fields={fields}
        users={users}
        templates={templates}
        allTags={[...new Set(cards.flatMap(c => c.tags || []))].sort()}
        onCardUpdate={updated => setCards(prev => prev.map(c => c._id?.toString() === updated._id?.toString() ? { ...c, ...updated } : c))}
        onCardDelete={(cardId) => {
          setCards(prev => prev.filter(c => c._id?.toString() !== cardId?.toString()));
          openCard(null);
        }}
        onCardMove={(cardId) => {
          setCards(prev => prev.filter(c => c._id?.toString() !== cardId?.toString()));
          openCard(null);
        }}
      />
    </Box>
  );
}
