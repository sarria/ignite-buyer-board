import { useMemo, useState } from 'react';
import {
  Box, Typography, Button, Popover, Menu, Chip, Select, MenuItem, FormControl,
  IconButton, Badge, Divider, Checkbox, ListItemText, Tooltip,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { tagColor } from '../../utils/tagColor';
import { EMPTY_FILTERS, activeFilterKeys } from '../../utils/cardFilters';

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
  filters, onChange, completion, onCompletionChange, users, columns, enumFields, allTags,
}) {
  const [anchor, setAnchor] = useState(null);
  const [addAnchor, setAddAnchor] = useState(null);
  // Filters the user added but hasn't chosen a value for yet — without this, picking
  // "Assignee" from the menu would render nothing until a value existed.
  const [pending, setPending] = useState([]);

  const active = activeFilterKeys(filters);
  // 'all' is the neutral default, so only a narrowed completion counts toward the badge.
  const count = active.length + (completion !== 'all' ? 1 : 0);

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
            {count > 0 && <Button size="small" onClick={clearAll}>Clear all</Button>}
          </Box>

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
    </>
  );
}
