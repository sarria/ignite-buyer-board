import { useEffect, useState, useCallback, useMemo, useTransition } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, TextField,
  Tooltip, IconButton, Chip, Divider, Skeleton, InputBase, Button,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SettingsIcon from '@mui/icons-material/Settings';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import SearchIcon from '@mui/icons-material/Search';
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors,
  DragOverlay, closestCorners, PointerSensor,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import BoardColumn from '../components/Board/BoardColumn';
import BoardCard from '../components/Board/BoardCard';
import ArchivedGrid from '../components/Board/ArchivedGrid';
import CalendarView from '../components/Board/CalendarView';
import BoardFilters from '../components/Board/BoardFilters';
import { cardMatchesFilters, matchesCompletion, EMPTY_FILTERS } from '../utils/cardFilters';
import CardDrawer from '../components/Card/CardDrawer';
import { getBoard, updateBoard } from '../api/boards';
import { getCards, getCardCounts, createCard, moveCard, reorderCards, updateCard } from '../api/cards';
import { reorderColumns } from '../api/columns';
import { getTemplates, applyTemplate } from '../api/templates';
import api from '../api/client';
import { useApp } from '../context/AppContext';
import { setLastBoardId, clearLastBoardId } from '../utils/lastBoard';
import {
  getBoardSnapshot, setBoardSnapshot, clearBoardSnapshot,
  getUsersCache, setUsersCache,
} from '../utils/boardCache';

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

// Click-to-edit board title in the top bar (borderless until hover, like the drawer).
function EditableBoardTitle({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);

  const titleSx = { fontSize: '1.0625rem', fontWeight: 600, whiteSpace: 'nowrap' };

  const save = async () => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== name) await onSave(trimmed);
    else setVal(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <InputBase
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') { setVal(name); setEditing(false); }
        }}
        sx={{ ...titleSx, px: 0.75, borderRadius: 1, border: 1, borderColor: 'primary.main', '& input': { p: 0 } }}
      />
    );
  }

  return (
    <Tooltip title="Rename board" placement="bottom-start">
      <Typography
        onClick={() => { setVal(name); setEditing(true); }}
        sx={{ ...titleSx, px: 0.75, mr: 0.25, borderRadius: 1, cursor: 'text', border: 1, borderColor: 'transparent', '&:hover': { borderColor: 'divider' } }}
      >
        {name}
      </Typography>
    </Tooltip>
  );
}

export default function BoardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useApp();

  // Hydrate synchronously from the cache so returning to a board is instant
  // (no skeleton flash). These initializers run once on mount.
  const cachedInit = getBoardSnapshot(id);
  const [board, setBoard] = useState(cachedInit?.board ?? null);
  const [columns, setColumns] = useState(cachedInit?.columns ?? []);
  const [cards, setCards] = useState(cachedInit?.cards ?? []);
  const [users, setUsers] = useState(getUsersCache() ?? []);
  const [loading, setLoading] = useState(!cachedInit);
  const [cardsLoading, setCardsLoading] = useState(!cachedInit);
  const [error, setError] = useState(null);
  // All filters in ONE object (see utils/cardFilters) so views, the popover and the
  // predicate can't drift. Completion stays separate: the archive view ignores it.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Defaults to 'all': buyers want the whole board, not a filtered slice, on arrival.
  const [completedFilter, setCompletedFilter] = useState('all'); // incomplete | all | completed
  const [activeCard, setActiveCard] = useState(null);
  const [activeColumnId, setActiveColumnId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Drawer open state is LOCAL (instant open/close) but mirrored to the URL
  // (?card=<id>) for deep-linking; initialized from and synced to the URL.
  const [drawerCardId, setDrawerCardId] = useState(() => searchParams.get('card'));
  const [didDrag, setDidDrag] = useState(false);
  const [templates, setTemplates] = useState(cachedInit?.templates ?? []);
  // Which view: 'board' | 'calendar' (list is next). Mirrored to ?view= so a link
  // shares the view, and remembered per board so switching away and back is sticky.
  const [view, setView] = useState(() => {
    const fromUrl = searchParams.get('view');
    if (fromUrl === 'calendar' || fromUrl === 'board') return fromUrl;
    try { return localStorage.getItem(`board.view.${id}`) || 'board'; } catch { return 'board'; }
  });
  const [showArchived, setShowArchived] = useState(false);
  const [archivedLoaded, setArchivedLoaded] = useState(cachedInit?.archivedLoaded ?? false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const cached = getBoardSnapshot(id);

    if (cached) {
      // Instant: show the cached board now, revalidate silently below (no skeleton).
      setBoard(cached.board);
      setColumns(cached.columns);
      setCards(cached.cards);
      setTemplates(cached.templates);
      setArchivedLoaded(cached.archivedLoaded);
      setLoading(false);
      setCardsLoading(false);
    } else {
      // Cold load: reset so we show this board's skeleton, not stale data.
      setLoading(true);
      setCardsLoading(true);
      setBoard(null);
      setColumns([]);
      setCards([]);
      setTemplates([]);
      setArchivedLoaded(false);
    }
    setError(null);
    setShowArchived(false);

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
        if (cancelled) return;
        // Board is gone or unreachable — drop the stale pointer/cache so '/' won't loop back here.
        clearBoardSnapshot(id);
        if (!cached) { clearLastBoardId(); setError(e.message); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Cards fill in as they arrive (skeleton cards show meanwhile on a cold load).
    getCards(id, { archived: 'false' })
      .then(cardsData => {
        if (cancelled) return;
        // Preserve any already-loaded archived cards; refresh the active ones.
        setCards(prev => {
          const activeIds = new Set(cardsData.map(c => c._id.toString()));
          const archived = prev.filter(c => c.isArchived && !activeIds.has(c._id.toString()));
          return [...cardsData, ...archived];
        });
      })
      .finally(() => { if (!cancelled) setCardsLoading(false); });

    // Users + templates are non-blocking (filters / template menus).
    api.get('/users').then(r => { if (!cancelled) { setUsers(r.data); setUsersCache(r.data); } }).catch(() => {});
    getTemplates(id).then(t => { if (!cancelled) setTemplates(t); }).catch(() => {});

    return () => { cancelled = true; };
  }, [id]);

  // Keep the cache in sync with the live board state so the next visit is instant.
  // Subtask/comment counts arrive AFTER the cards are on screen: they cost ~2s on a big
  // board and the board is frame-first. A failure is silent — a missing count is a far
  // smaller problem than a board that won't render.
  useEffect(() => {
    let cancelled = false;
    getCardCounts(id)
      .then((counts) => {
        if (cancelled) return;
        setCards(prev => prev.map(c => (counts[c._id] ? { ...c, ...counts[c._id] } : c)));
      })
      .catch(() => { /* counts are optional */ });
    return () => { cancelled = true; };
  }, [id]);

  // Persist the view per board, and keep ?view= in sync (replace, so switching views
  // doesn't stack history entries the back button has to walk through).
  useEffect(() => {
    try { localStorage.setItem(`board.view.${id}`, view); } catch { /* ignore */ }
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (view === 'board') next.delete('view'); else next.set('view', view);
      return next;
    }, { replace: true });
  }, [view, id, setSearchParams]);

  // Guard on board._id === id: during a board→board switch the id dep changes a
  // render before the state does, and we must not write the old board under the new key.
  useEffect(() => {
    if (loading || !board || board._id?.toString() !== id?.toString()) return;
    setBoardSnapshot(id, { board, columns, cards, templates, archivedLoaded });
  }, [id, board, columns, cards, templates, archivedLoaded, loading]);

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

  const handleAddCard = useCallback(async (columnId, title, extra = {}) => {
    const created = await createCard(id, { columnId, title, ...extra });
    setCards(prev => [...prev, created]);
    openCard(created._id); // open the new card so the user can keep filling it in
  }, [id, openCard]);

  // Adding from a calendar day cell. The calendar has no column context, so new cards
  // land in the FIRST column — the same place the board's own composer would put a card
  // you hadn't sorted yet. The due date comes from the cell you clicked.
  // Deliberately does NOT open the drawer: you're usually adding several days at once,
  // and a drawer over the calendar after each one would fight that.
  const handleAddCardOnDate = useCallback(async (title, iso) => {
    const columnId = columns[0]?._id;
    if (!columnId) return;
    const created = await createCard(id, { columnId, title, dueDate: iso });
    setCards(prev => [...prev, created]);
  }, [id, columns]);

  // Optimistic complete/incomplete straight from a card face (calendar's hover check).
  // Flipping locally first keeps the click instant; a failure rolls it back, since a
  // card that looks done but isn't is worse than a click that visibly didn't take.
  const handleToggleComplete = useCallback(async (card) => {
    const next = !card.isCompleted;
    const patch = { isCompleted: next, completedAt: next ? new Date().toISOString() : null };
    setCards(prev => prev.map(c => (c._id === card._id ? { ...c, ...patch } : c)));
    try {
      const updated = await updateCard(card._id, { isCompleted: next });
      setCards(prev => prev.map(c => (c._id === card._id ? { ...c, ...updated } : c)));
    } catch {
      setCards(prev => prev.map(c => (c._id === card._id
        ? { ...c, isCompleted: card.isCompleted, completedAt: card.completedAt }
        : c)));
    }
  }, []);

  const handleRenameBoard = useCallback(async (name) => {
    const updated = await updateBoard(id, { name });
    setBoard(prev => (prev ? { ...prev, name: updated.name } : prev));
    // Sidebar loads boards once and persists across routes — notify it to update.
    window.dispatchEvent(new CustomEvent('board:renamed', { detail: { id, name: updated.name } }));
  }, [id]);

  const handleUnarchiveBoard = useCallback(async () => {
    const updated = await updateBoard(id, { isArchived: false });
    setBoard(prev => (prev ? { ...prev, isArchived: updated.isArchived } : prev));
    window.dispatchEvent(new CustomEvent('boards:changed'));
  }, [id]);

  const handleApplyTemplate = useCallback(async (template, columnId, title) => {
    const created = await applyTemplate(template._id, columnId, title);
    setCards(prev => [...prev, created]);
    openCard(created._id);
  }, [openCard]);

  const fields = board?.fields || [];
  // Every enum custom field is filterable, not just Health — boards carry others.
  const enumFields = useMemo(() => fields.filter(f => f.type === 'enum'), [fields]);

  // All tags used on this board (for the toolbar Tag filter + drawer combobox).
  const allTags = useMemo(
    () => [...new Set(cards.flatMap(c => c.tags || []))].sort((a, b) => a.localeCompare(b)),
    [cards]
  );

  // Active (non-archived) cards passing the toolbar filters — what the board columns and
  // the calendar both draw from.
  const visibleCards = useMemo(
    () => cards.filter(card => !card.isArchived
      && matchesCompletion(card, completedFilter)
      && cardMatchesFilters(card, filters)),
    [cards, completedFilter, filters]
  );

  const cardsByColumn = useMemo(() => {
    const filtered = showArchived ? [] : visibleCards;
    const map = {};
    columns.forEach(col => { map[col._id] = []; });
    filtered.forEach(card => {
      const key = card.columnId?.toString();
      if (map[key]) map[key].push(card);
    });
    return map;
  }, [visibleCards, columns, showArchived]);

  // Archive view is a flat grid (not grouped by column). Same filters as the board
  // minus the completion filter — the archive shows complete + incomplete together.
  const archivedCards = useMemo(() => {
    if (!showArchived) return [];
    return cards.filter(card => card.isArchived && cardMatchesFilters(card, filters));
  }, [showArchived, cards, filters]);

  const columnNameById = useMemo(
    () => Object.fromEntries(columns.map(c => [c._id?.toString(), c.name])),
    [columns]
  );

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
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default', overflow: 'hidden' }}>
      {/* Top bar */}
      <Box sx={{
        px: 2.5, py: 1.25,
        borderBottom: '1px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 1.25,
        bgcolor: 'background.paper', flexShrink: 0,
      }}>
        {board
          ? <EditableBoardTitle name={board.name} onSave={handleRenameBoard} />
          : <Skeleton variant="text" width={180} sx={{ fontSize: '1.0625rem', mr: 0.25 }} />}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.75, my: 0.75 }} />

        <TextField
          size="small" placeholder="Search tasks" value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 18, color: 'text.disabled', mr: 0.75 }} /> }}
          sx={{
            width: 200,
            '& .MuiOutlinedInput-root': { ...controlSx, px: 1.25 },
            '& input': { py: 0, fontSize: '0.8125rem' },
          }}
        />

        <BoardFilters
          filters={filters}
          onChange={setFilters}
          completion={completedFilter}
          onCompletionChange={setCompletedFilter}
          users={users}
          columns={columns}
          enumFields={enumFields}
          allTags={allTags}
        />
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* View switcher. Hidden in the archive view, which is its own flat grid and
              has no calendar equivalent. List is next. */}
          {!showArchived && (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_, v) => { if (v) setView(v); }}
              sx={{ mr: 0.5, '& .MuiToggleButton-root': { px: 1.25, py: 0.375, textTransform: 'none', border: 0 } }}
            >
              <ToggleButton value="board">
                <ViewKanbanOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} /> Board
              </ToggleButton>
              <ToggleButton value="calendar">
                <CalendarMonthOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} /> Calendar
              </ToggleButton>
            </ToggleButtonGroup>
          )}
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

      {/* Archived-board banner (this board itself is archived, not the card filter) */}
      {board?.isArchived && (
        <Box sx={{
          flexShrink: 0, px: 2.5, py: 1,
          bgcolor: '#4573d222', borderBottom: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', gap: 1,
        }}>
          <ArchiveIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600 }}>
            This board is archived — hidden from the sidebar and dashboard.
          </Typography>
          <Button size="small" startIcon={<UnarchiveIcon />} onClick={handleUnarchiveBoard} sx={{ ml: 'auto' }}>
            Unarchive
          </Button>
        </Box>
      )}

      {/* Board / Calendar / (archive grid) */}
      {!showArchived && view === 'calendar' ? (
        <CalendarView
          cards={visibleCards}
          fields={fields}
          users={users}
          columns={columns}
          selectedCardId={drawerCardId}
          onCardClick={card => openCard(card._id)}
          onToggleComplete={handleToggleComplete}
          onAddCard={handleAddCardOnDate}
        />
      ) : showArchived ? (
        <ArchivedGrid
          cards={archivedCards}
          fields={fields}
          users={users}
          columnNameById={columnNameById}
          selectedCardId={drawerCardId}
          onCardClick={card => openCard(card._id)}
        />
      ) : (
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
      )}

      <CardDrawer
        cardId={drawerCardId}
        open={!!drawerCardId}
        onClose={() => openCard(null)}
        board={board}
        columns={columns}
        fields={fields}
        users={users}
        templates={templates}
        allTags={allTags}
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
