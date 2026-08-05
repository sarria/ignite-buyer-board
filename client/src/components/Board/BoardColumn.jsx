import { useState, useRef, useEffect } from 'react';
import { Box, Typography, Paper, IconButton, TextField, Button, Menu, MenuItem, Tooltip, Skeleton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import { useDroppable } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import BoardCard from './BoardCard';

export default function BoardColumn({
  column, cards = [], fields = [], users = [], templates = [],
  onCardClick, onAddCard, onApplyTemplate, showArchived = false, isDragOverlay = false, addSignal = 0,
  selectedCardId = null, loadingCards = false,
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: column._id,
    data: { type: 'column', columnId: column._id },
  });

  const {
    attributes, listeners, setNodeRef: setSortRef,
    transform, transition, isDragging,
  } = useSortable({ id: column._id, data: { type: 'column' } });

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [templateAnchor, setTemplateAnchor] = useState(null);

  // The board's header "Add task" opens THIS column's composer rather than a modal, so
  // creating a card looks the same however you start it. Only the first column is given a
  // rising signal (see BoardPage).
  useEffect(() => { if (addSignal) setAdding(true); }, [addSignal]);
  const scrollRef = useRef(null);

  // New cards land at the end of the list (which may be scrolled out of view).
  // Scroll the column to the bottom so the card isn't lost after saving.
  const scrollToNewCard = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }));
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) { setAdding(false); return; }
    setSaving(true);
    await onAddCard(column._id, newTitle.trim());
    setNewTitle('');
    setAdding(false);
    setSaving(false);
    scrollToNewCard();
  };

  const handleApplyTemplate = async (template) => {
    setTemplateAnchor(null);
    setAdding(false);
    setSaving(true);
    await onApplyTemplate(template, column._id, newTitle.trim() || null);
    setNewTitle('');
    setSaving(false);
    scrollToNewCard();
  };

  const style = isDragOverlay ? {} : {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : 'auto',
  };

  return (
    <Box
      ref={setSortRef}
      style={style}
      sx={{ minWidth: 280, maxWidth: 280, display: 'flex', flexDirection: 'column', mx: 1, height: '100%', maxHeight: '100%' }}
    >
      <Paper
        elevation={0}
        sx={{
          flexShrink: 0,
          px: 1.5, py: 1.25, mb: 1,
          borderRadius: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'default',
        }}
      >
        {/* Drag handle */}
        <Box
          {...attributes}
          {...listeners}
          sx={{
            display: 'flex', alignItems: 'center', mr: 0.5,
            cursor: 'grab', color: 'text.disabled',
            '&:active': { cursor: 'grabbing' },
            '&:hover': { color: 'text.secondary' },
          }}
        >
          <DragIndicatorIcon sx={{ fontSize: 16 }} />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          {column.color && (
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: column.color, flexShrink: 0 }} />
          )}
          <Typography variant="body2" fontWeight={700} noWrap>{column.name}</Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{ bgcolor: 'action.hover', borderRadius: 10, px: 0.75, py: 0.25, fontWeight: 600, minWidth: 22, textAlign: 'center', flexShrink: 0 }}
        >
          {cards.length}
        </Typography>
      </Paper>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: theme => isOver
            ? (theme.palette.mode === 'dark' ? '#2e3a2e' : '#e8f5e9')
            : (theme.palette.mode === 'dark' ? '#242424' : '#f1f1f1'),
          borderRadius: 1.5,
          transition: 'background-color 0.15s',
        }}
      >
        <Box ref={node => { setDropRef(node); scrollRef.current = node; }} sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
        {loadingCards ? (
          // Standard-card-height placeholders, enough to fill the column height.
          Array.from({ length: Math.ceil(window.innerHeight / 156) }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={144} sx={{ mb: 1.5, borderRadius: 1.5 }} />
          ))
        ) : (
          <SortableContext items={cards.map(c => c._id)} strategy={verticalListSortingStrategy}>
            {cards.map(card => (
              <BoardCard
                key={card._id}
                card={card}
                fields={fields}
                users={users}
                onClick={() => onCardClick(card)}
                dimmed={card.isArchived}
                selected={selectedCardId?.toString() === card._id?.toString()}
              />
            ))}
          </SortableContext>
        )}
        </Box>

        {!isDragOverlay && !showArchived && !loadingCards && (
          <Box sx={{ flexShrink: 0, px: 1, pb: 1 }}>{adding ? (
            <Box sx={{ mt: 1 }}>
              <TextField
                autoFocus fullWidth size="small" multiline maxRows={4}
                placeholder="Card title…" value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
                  if (e.key === 'Escape') { setAdding(false); setNewTitle(''); }
                }}
                sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <Button
                    size="small" variant="contained"
                    disabled={saving || !newTitle.trim()} onClick={handleAdd}
                    sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' }, textTransform: 'none', fontWeight: 600, minWidth: 0 }}
                  >
                    Add card
                  </Button>
                  {templates.length > 0 && (
                    <>
                      <Tooltip title="From template">
                        <IconButton size="small" onClick={e => setTemplateAnchor(e.currentTarget)} sx={{ color: 'text.secondary' }}>
                          <DashboardCustomizeIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Menu anchorEl={templateAnchor} open={Boolean(templateAnchor)} onClose={() => setTemplateAnchor(null)}>
                        {templates.map(t => (
                          <MenuItem key={t._id} onClick={() => handleApplyTemplate(t)} dense>{t.name}</MenuItem>
                        ))}
                      </Menu>
                    </>
                  )}
                </Box>
                <Tooltip title="Cancel">
                  <IconButton size="small" onClick={() => { setAdding(false); setNewTitle(''); }} sx={{ color: 'text.secondary' }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ) : (
            <Box
              onClick={() => setAdding(true)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                mt: 0.5, px: 0.5, py: 0.75, borderRadius: 1,
                cursor: 'pointer', color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                transition: 'all 0.15s',
              }}
            >
              <AddIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">Add card</Typography>
            </Box>
          )}</Box>
        )}
      </Box>
    </Box>
  );
}
