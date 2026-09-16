import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Button, Popover, Menu, Chip, Select, MenuItem, FormControl,
  IconButton, Badge, Divider, Checkbox, ListItemText, Tooltip, TextField, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import { tagColor } from '../../utils/tagColor';
import { EMPTY_FILTERS, activeFilterKeys } from '../../utils/cardFilters';
import { getSavedFilters, createSavedFilter, deleteSavedFilter } from '../../api/boards';

// One Filter button + popover, replacing the row of inline pills. That row worked with
// three filters and would not with a dozen — Asana solves it the same way: quick-filter
// chips for the common cases, "Add filter" for the rest.
//
// Deliberately NOT offered, because the data can't back them:
//   • "Created by" — cards have no createdBy field.
//   • "Just my tasks" — auth is still a stub, so everyone IS the same dev user.
// Both become possible with MSAL SSO; adding them now would just lie.

const DAY_WINDOWS = [
  { v: '7', label: 'Last 7 days' },
  { v: '30', label: 'Last 30 days' },
  { v: '90', label: 'Last 90 days' },
];

const DUE_OPTIONS = [
  { v: 'overdue', label: 'Overdue' },
  { v: 'today', label: 'Due today' },
  { v: 'next7', label: 'Due in the next 7 days' },
  { v: 'has', label: 'Has a due date' },
  { v: 'none', label: 'No due date' },
];

const LUMINA_OPTIONS = [
  { v: 'linked', label: 'Linked to Lumina' },
  { v: 'unlinked', label: 'Not linked' },
];

// Quick chips: the filters buyers reach for constantly. "Not linked to Lumina" is
// Ignite-specific — it's the worklist of accounts still needing a link.
const QUICK = [
  { key: 'due', value: 'overdue', label: 'Overdue' },
  { key: 'due', value: 'today', label: 'Due today' },
  { key: 'due', value: 'none', label: 'No due date' },
  { key: 'lumina', value: 'unlinked', label: 'Not linked to Lumina' },
];

const selectSx = { minWidth: 200, '& .MuiSelect-select': { py: 0.75, fontSize: '0.8125rem' } };

export default function BoardFilters({
  boardId, filters, onChange, completion, onCompletionChange, users, columns, enumFields, allTags,
}) {
  const [anchor, setAnchor] = useState(null);
  const [addAnchor, setAddAnchor] = useState(null);
  // Filters the user added but hasn't chosen a value for yet — without this, picking
  // "Assignee" from the menu would render nothing until a value existed.
  const [pending, setPending] = useState([]);

  // Saved filters: this buyer's own reusable filter presets for this board (separate
  // from the auto-remembered "last used" state — see BoardPage's boardPrefs sync).
  const [savedFilters, setSavedFilters] = useState([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [savingOpen, setSavingOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!anchor || savedLoaded) return;
    getSavedFilters(boardId).then(setSavedFilters).finally(() => setSavedLoaded(true));
  }, [anchor, boardId, savedLoaded]);

  const active = activeFilterKeys(filters);
  // 'all' is the neutral default, so only a narrowed completion counts toward the badge.
  const count = active.length + (completion !== 'all' ? 1 : 0);

  // Values already carried by sf.filters make their rows show on their own (shownKeys
  // reads valueOf(key)) — no need to touch `pending`, which only covers a row added
  // via "Add filter" that has no value yet.
  const applySavedFilter = (sf) => {
    onChange({ ...EMPTY_FILTERS, ...sf.filters });
    onCompletionChange(sf.completedFilter || 'all');
  };

  const handleSaveCurrent = async () => {
    if (!saveName.trim() || saving) return;
    setSaving(true);
    try {
      const created = await createSavedFilter(boardId, { name: saveName.trim(), filters, completedFilter: completion });
      setSavedFilters(prev => [...prev, created]);
      setSaveName('');
      setSavingOpen(false);
    } finally {
      setSaving(false);
    }
  };

  // Deleting a saved filter is permanent (no undo), so it needs an explicit confirm —
  // a stray click on a small chip icon is easy to do by accident.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const confirmDeleteSaved = () => {
    const sf = deleteTarget;
    setDeleteTarget(null);
    setSavedFilters(prev => prev.filter(x => x._id !== sf._id));
    deleteSavedFilter(sf._id).catch(() => {
      // Best-effort optimistic remove — put it back if the delete didn't actually happen.
      setSavedFilters(prev => (prev.some(x => x._id === sf._id) ? prev : [...prev, sf]));
    });
  };

  const set = (key, value) => onChange({ ...filters, [key]: value });
  const setEnum = (fieldId, value) =>
    onChange({ ...filters, enums: { ...filters.enums, [fieldId]: value } });

  const clearAll = () => {
    onChange({ ...EMPTY_FILTERS, search: filters.search });
    onCompletionChange('all');
    setPending([]);
  };

  // Every filter this board can offer, in menu order. `enum:<id>` rows are generated
  // from the board's own enum fields, so a board with more than Health gets them all.
  const defs = useMemo(() => {
    const list = [
      { key: 'due', label: 'Due date', options: DUE_OPTIONS },
      { key: 'assignee', label: 'Assignee', options: users.map(u => ({ v: u._id, label: u.name })) },
      { key: 'column', label: 'Column', options: columns.map(c => ({ v: c._id, label: c.name })) },
    ];
    for (const f of enumFields) {
      list.push({
        key: `enum:${f._id}`,
        label: f.name,
        options: (f.options || []).map(o => ({ v: o, label: o })),
      });
    }
    list.push({ key: 'lumina', label: 'Lumina link', options: LUMINA_OPTIONS });
    list.push({ key: 'createdWithin', label: 'Created', options: DAY_WINDOWS });
    list.push({ key: 'modifiedWithin', label: 'Last modified', options: DAY_WINDOWS });
    list.push({ key: 'completedWithin', label: 'Completed on', options: DAY_WINDOWS });
    return list;
  }, [users, columns, enumFields]);

  const valueOf = (key) =>
    (key.startsWith('enum:') ? filters.enums?.[key.slice(5)] : filters[key]) || '';
  const setValue = (key, v) =>
    (key.startsWith('enum:') ? setEnum(key.slice(5), v) : set(key, v));

  // Shown rows: anything with a value, plus anything explicitly added.
  const shownKeys = defs
    .map(d => d.key)
    .filter(k => valueOf(k) || pending.includes(k));
  const addableKeys = defs.filter(d => !shownKeys.includes(d.key));

  const removeRow = (key) => {
    setValue(key, '');
    setPending(p => p.filter(k => k !== key));
  };

  return (
    <>
      <Tooltip title="Filters">
        <Button
          size="small"
          onClick={e => setAnchor(e.currentTarget)}
          startIcon={
            <Badge badgeContent={count} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 15, minWidth: 15 } }}>
              <FilterListIcon sx={{ fontSize: 18 }} />
            </Badge>
          }
          sx={{
            height: 34, borderRadius: 2, px: 1.5, color: count ? 'primary.main' : 'text.secondary',
            bgcolor: count ? 'action.selected' : 'action.hover',
            '&:hover': { bgcolor: 'action.selected' },
          }}
        >
          Filter
        </Button>
      </Tooltip>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.5, width: 380, borderRadius: 2 } } }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>Filters</Typography>
            <Box sx={{ flex: 1 }} />
            {count > 0 && (
              <Tooltip title="Save the current filters as a reusable named filter">
                <Button size="small" startIcon={<BookmarkBorderIcon sx={{ fontSize: 16 }} />} onClick={() => setSavingOpen(o => !o)}>
                  Save filter
                </Button>
              </Tooltip>
            )}
            {count > 0 && <Button size="small" onClick={clearAll}>Clear all</Button>}
          </Box>

          {savingOpen && (
            <Box sx={{ display: 'flex', gap: 0.75, mb: 2 }}>
              <TextField
                size="small"
                autoFocus
                fullWidth
                placeholder="Name this filter"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveCurrent(); if (e.key === 'Escape') setSavingOpen(false); }}
                sx={{ '& .MuiOutlinedInput-input': { py: 0.75, fontSize: '0.8125rem' } }}
              />
              <Button size="small" variant="contained" disabled={!saveName.trim() || saving} onClick={handleSaveCurrent}>
                {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
              </Button>
            </Box>
          )}

          {/* Saved filters — this buyer's own reusable named filters, reused across visits. */}
          {savedFilters.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary">Saved filters</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75, mb: 2 }}>
                {savedFilters.map(sf => (
                  <Chip
                    key={sf._id}
                    size="small"
                    icon={<BookmarkBorderIcon sx={{ fontSize: 14 }} />}
                    label={sf.name}
                    variant="outlined"
                    onClick={() => applySavedFilter(sf)}
                    deleteIcon={
                      <Tooltip title="Delete this filter">
                        <DeleteOutlineIcon />
                      </Tooltip>
                    }
                    onDelete={() => setDeleteTarget(sf)}
                    sx={{ '& .MuiChip-deleteIcon': { color: 'error.main', '&:hover': { color: 'error.dark' } } }}
                  />
                ))}
              </Box>
            </>
          )}

          {/* Completion is its own row rather than an add/remove filter: it always has a
              value. 'All' is the default, so it contributes nothing to the badge count. */}
          <Typography variant="caption" color="text.secondary">Tasks</Typography>
          <FormControl size="small" fullWidth sx={{ mt: 0.5, mb: 2 }}>
            <Select value={completion} onChange={e => onCompletionChange(e.target.value)} sx={selectSx}>
              <MenuItem value="incomplete">Incomplete</MenuItem>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
            </Select>
          </FormControl>

          <Typography variant="caption" color="text.secondary">Quick filters</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75, mb: 2 }}>
            {QUICK.map(q => {
              const on = filters[q.key] === q.value;
              return (
                <Chip
                  key={`${q.key}:${q.value}`}
                  size="small"
                  label={q.label}
                  variant={on ? 'filled' : 'outlined'}
                  color={on ? 'primary' : 'default'}
                  onClick={() => set(q.key, on ? '' : q.value)}
                />
              );
            })}
          </Box>

          {allTags.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary">Tags (match any)</Typography>
              <FormControl size="small" fullWidth sx={{ mt: 0.5, mb: 2 }}>
                <Select
                  multiple
                  displayEmpty
                  value={filters.tags}
                  onChange={e => set('tags', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                  renderValue={v => (v.length ? `${v.length} selected` : 'Any tag')}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
                  sx={selectSx}
                >
                  {allTags.map(tag => (
                    <MenuItem key={tag} value={tag} dense>
                      <Checkbox size="small" checked={filters.tags.includes(tag)} sx={{ p: 0.5, mr: 0.5 }} />
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: tagColor(tag).dot, flexShrink: 0, mr: 1 }} />
                      <ListItemText primaryTypographyProps={{ variant: 'body2', noWrap: true }} primary={tag} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {shownKeys.length > 0 && <Divider sx={{ mb: 1.5 }} />}

          {shownKeys.map(key => {
            const def = defs.find(d => d.key === key);
            return (
              <Box key={key} sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">{def.label}</Typography>
                  <Box sx={{ flex: 1 }} />
                  <IconButton size="small" onClick={() => removeRow(key)} sx={{ p: 0.25 }}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
                <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
                  <Select
                    displayEmpty
                    value={valueOf(key)}
                    onChange={e => setValue(key, e.target.value)}
                    sx={selectSx}
                  >
                    <MenuItem value="">Any</MenuItem>
                    {def.options.map(o => <MenuItem key={o.v} value={o.v}>{o.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
            );
          })}

          {addableKeys.length > 0 && (
            <Button
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={e => setAddAnchor(e.currentTarget)}
            >
              Add filter
            </Button>
          )}
        </Box>
      </Popover>

      {/* Menu, NOT Popover: MenuItem needs the MenuListContext that Menu provides, and
          a Popover full of MenuItems throws "MenuListContext is missing" on open. */}
      <Menu
        open={!!addAnchor}
        anchorEl={addAnchor}
        onClose={() => setAddAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 200, maxHeight: 360 } } }}
      >
        {addableKeys.map(d => (
          <MenuItem
            key={d.key}
            dense
            onClick={() => { setPending(p => [...p, d.key]); setAddAnchor(null); }}
          >
            {d.label}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete saved filter?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            The filter <strong>"{deleteTarget?.name}"</strong> will be permanently deleted. This can't be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={confirmDeleteSaved}
            sx={{ bgcolor: 'error.main', '&:hover': { bgcolor: 'error.dark' } }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
