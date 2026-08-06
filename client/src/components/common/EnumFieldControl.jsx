import { useState } from 'react';
import { Box, Chip, Menu, MenuItem, Tooltip, Typography } from '@mui/material';

// Set an enum custom field (Health, SEM-KPI, …) in place, the same way the assignee and
// due date are set from a row: the chip when there's a value, a quiet dashed pill when
// there isn't, and a click opens the options. Health is the field buyers change most, and
// having to open the drawer for it made the List view read-only in practice.

const HEALTH_COLORS = {
  'Good': '#4caf50',
  'Ok': '#ff9800',
  'Needs Work': '#f44336',
  'Waiting on DCM': '#2196f3',
};

export const enumChipSx = (v) => ({
  height: 20, fontSize: 11, fontWeight: 600,
  bgcolor: HEALTH_COLORS[v] || 'action.selected',
  color: HEALTH_COLORS[v] ? '#fff' : 'text.primary',
});

export default function EnumFieldControl({ field, value, onChange, readOnly = false }) {
  const [anchor, setAnchor] = useState(null);

  const open = (e) => {
    if (readOnly) return;
    e.stopPropagation();
    setAnchor(e.currentTarget);
  };

  const pick = (e, v) => {
    e.stopPropagation();
    setAnchor(null);
    if (v !== value) onChange?.(v);
  };

  if (!value && readOnly) return null;

  return (
    <>
      <Box onClick={open} onMouseDown={e => e.stopPropagation()} sx={{ display: 'inline-flex', minWidth: 0 }}>
        {value ? (
          <Chip
            size="small"
            label={value}
            sx={{ ...enumChipSx(value), cursor: readOnly ? 'default' : 'pointer' }}
          />
        ) : (
          <Tooltip title={`Set ${field.name}`}>
            <Box
              sx={{
                height: 20, px: 1, borderRadius: '10px', display: 'flex', alignItems: 'center',
                border: '1px dashed', borderColor: 'text.disabled', color: 'text.disabled',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
              }}
            >
              <Typography variant="caption" sx={{ fontSize: 11 }}>Set</Typography>
            </Box>
          </Tooltip>
        )}
      </Box>

      <Menu
        open={!!anchor}
        anchorEl={anchor}
        onClose={e => { e?.stopPropagation?.(); setAnchor(null); }}
        onClick={e => e.stopPropagation()}
      >
        <MenuItem onClick={e => pick(e, '')} selected={!value}>
          <Typography variant="body2" color="text.secondary">None</Typography>
        </MenuItem>
        {(field.options || []).map(o => (
          <MenuItem key={o} selected={o === value} onClick={e => pick(e, o)}>
            <Chip size="small" label={o} sx={enumChipSx(o)} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
