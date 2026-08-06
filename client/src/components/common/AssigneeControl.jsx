import { useState } from 'react';
import {
  Box, Avatar, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText, TextField,
} from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlineOutlined';
import { userColor } from '../../utils/userColor';

// Assign from wherever the task is, the way Asana does it: an avatar when someone is
// assigned, a dashed placeholder circle when nobody is, and a click opens the people
// list. Previously you had to open the card drawer to change an assignee, which is a lot
// of clicks for the one edit buyers make while scanning a column.
//
// Shared by the board card, list rows, calendar cards and subtasks so the control is
// learned once. Read-only (completed/archived) renders the same avatar, no menu.

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

export default function AssigneeControl({
  value, users = [], onChange, readOnly = false, size = 24, tooltip = 'Assign this task',
}) {
  const [anchor, setAnchor] = useState(null);
  const [q, setQ] = useState('');

  const user = users.find(u => u._id?.toString() === value?.toString()) || null;
  const shown = q.trim()
    ? users.filter(u => u.name?.toLowerCase().includes(q.trim().toLowerCase()))
    : users;

  const open = (e) => {
    if (readOnly) return;
    e.stopPropagation();     // never let this bubble into "open the card"
    e.preventDefault();
    setQ('');
    setAnchor(e.currentTarget);
  };

  const pick = (e, id) => {
    e.stopPropagation();
    setAnchor(null);
    if ((id || null) !== (value?.toString() || null)) onChange?.(id);
  };

  return (
    <>
      <Tooltip title={user ? user.name : (readOnly ? 'Unassigned' : tooltip)}>
        <Box
          onClick={open}
          onMouseDown={e => e.stopPropagation()}   // don't start a dnd-kit drag
          sx={{
            display: 'inline-flex', flexShrink: 0, borderRadius: '50%',
            cursor: readOnly ? 'default' : 'pointer',
          }}
        >
          {user ? (
            <Avatar sx={{ width: size, height: size, fontSize: size * 0.45, bgcolor: userColor(user) }}>
              {initials(user.name)}
            </Avatar>
          ) : (
            // Dashed ring = "nobody yet, click me". Asana's affordance; an empty gap
            // reads as "this card has no assignee field" rather than as a control.
            <Box
              sx={{
                width: size, height: size, borderRadius: '50%',
                display: readOnly ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px dashed', borderColor: 'text.disabled', color: 'text.disabled',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
              }}
            >
              <PersonOutlineIcon sx={{ fontSize: size * 0.6 }} />
            </Box>
          )}
        </Box>
      </Tooltip>

      <Menu
        open={!!anchor}
        anchorEl={anchor}
        onClose={e => { e?.stopPropagation?.(); setAnchor(null); }}
        onClick={e => e.stopPropagation()}
        slotProps={{ paper: { sx: { maxHeight: 340, width: 240 } } }}
      >
        {/* A board can carry a dozen buyers; typing beats scrolling. */}
        <Box sx={{ px: 1, pb: 0.5 }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Search people…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.stopPropagation()}   // keep MUI's type-ahead off our field
          />
        </Box>
        <MenuItem onClick={e => pick(e, null)} selected={!value}>
          <ListItemIcon>
            <PersonOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: 'body2' }}>No assignee</ListItemText>
        </MenuItem>
        {shown.map(u => (
          <MenuItem
            key={u._id}
            selected={u._id?.toString() === value?.toString()}
            onClick={e => pick(e, u._id.toString())}
          >
            <ListItemIcon>
              <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: userColor(u) }}>
                {initials(u.name)}
              </Avatar>
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: 'body2', noWrap: true }}>{u.name}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
