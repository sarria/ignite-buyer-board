import { useState } from 'react';
import { Button, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip, IconButton, Divider } from '@mui/material';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { SORT_NONE, sortFieldsFor } from '../../utils/cardSort';

// Asana's Sort: one button, a menu of fields (+ current one checked), and a direction
// toggle. Sorting is WITHIN each column/group, never across them.
export default function SortMenu({ sortBy, direction, onChange, enumFields }) {
  const [anchor, setAnchor] = useState(null);
  const fields = sortFieldsFor(enumFields);
  const active = sortBy !== SORT_NONE;

  const pick = (key) => {
    onChange(key, direction);
    setAnchor(null);
  };

  return (
    <>
      <Tooltip title="Sort">
        <Button
          size="small"
          onClick={e => setAnchor(e.currentTarget)}
          startIcon={<ImportExportIcon sx={{ fontSize: 18 }} />}
          sx={{
            height: 34, borderRadius: 2, px: 1.5, color: active ? 'primary.main' : 'text.secondary',
            bgcolor: active ? 'action.selected' : 'action.hover',
            '&:hover': { bgcolor: 'action.selected' },
          }}
        >
          Sort
        </Button>
      </Tooltip>

      {active && (
        <Tooltip title={direction === 'desc' ? 'Descending' : 'Ascending'}>
          <IconButton
            size="small"
            onClick={() => onChange(sortBy, direction === 'desc' ? 'asc' : 'desc')}
            sx={{ ml: -0.5, color: 'primary.main' }}
          >
            {direction === 'desc' ? <ArrowDownwardIcon sx={{ fontSize: 16 }} /> : <ArrowUpwardIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      )}

      <Menu
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        {active && (
          <>
            <MenuItem dense onClick={() => pick(SORT_NONE)} sx={{ color: 'text.secondary' }}>
              <ListItemIcon sx={{ minWidth: 28 }}><CloseIcon sx={{ fontSize: 16 }} /></ListItemIcon>
              <ListItemText>Clear sort</ListItemText>
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
          </>
        )}
        <MenuItem dense selected={sortBy === SORT_NONE} onClick={() => pick(SORT_NONE)}>
          <ListItemIcon sx={{ minWidth: 28 }}>{sortBy === SORT_NONE && <CheckIcon sx={{ fontSize: 16 }} />}</ListItemIcon>
          <ListItemText>Manual (drag order)</ListItemText>
        </MenuItem>
        {fields.map(f => (
          <MenuItem key={f.key} dense selected={sortBy === f.key} onClick={() => pick(f.key)}>
            <ListItemIcon sx={{ minWidth: 28 }}>{sortBy === f.key && <CheckIcon sx={{ fontSize: 16 }} />}</ListItemIcon>
            <ListItemText>{f.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
