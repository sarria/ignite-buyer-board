import { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Avatar, IconButton, Button, TextField,
  Select, MenuItem, FormControl, Tooltip, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, Divider, InputBase,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PeopleOutlineIcon from '@mui/icons-material/PeopleAltOutlined';
import { getUsers, createUser, updateUser, deleteUser } from '../api/users';
import { userColor } from '../utils/userColor';

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';

// Inline name editor — borderless until clicked (Asana-like, matches the card drawer).
function EditableName({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  const save = async () => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== value) await onSave(trimmed);
    else setVal(value);
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
          if (e.key === 'Escape') { setVal(value); setEditing(false); }
        }}
        sx={{
          fontSize: 14, fontWeight: 600, px: 0.75, py: 0.1,
          borderRadius: 1, border: 1, borderColor: 'primary.main',
        }}
      />
    );
  }

  return (
    <Typography
      variant="body2"
      fontWeight={600}
      noWrap
      onClick={() => { setVal(value); setEditing(true); }}
      sx={{
        px: 0.75, py: 0.1, borderRadius: 1, cursor: 'text',
        border: 1, borderColor: 'transparent',
        '&:hover': { borderColor: 'divider' },
      }}
    >
      {value}
    </Typography>
  );
}

function UserRow({ user, divider, onUpdate, onDeactivate, onReactivate }) {
  const deactivated = !!user.deactivated;
  return (
    <Box>
      {divider && <Divider />}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, px: 1,
          borderRadius: 1.5, opacity: deactivated ? 0.55 : 1,
          '&:hover': { bgcolor: 'action.hover' },
          '&:hover .row-actions': { opacity: 1 },
          transition: 'background-color 0.15s',
        }}
      >
        <Avatar sx={{ width: 38, height: 38, fontSize: 13, bgcolor: userColor(user), flexShrink: 0 }}>
          {initials(user.name)}
        </Avatar>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          {deactivated ? (
            <Typography variant="body2" fontWeight={600} noWrap>{user.name}</Typography>
          ) : (
            <EditableName value={user.name} onSave={val => onUpdate(user._id, { name: val })} />
          )}
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', px: 0.75 }}>
            {user.email}
          </Typography>
        </Box>

        {/* Role */}
        {deactivated ? (
          <Chip label={user.role || 'member'} size="small" sx={{ fontWeight: 600 }} />
        ) : (
          <FormControl size="small" variant="standard">
            <Select
              disableUnderline
              value={user.role || 'member'}
              onChange={e => onUpdate(user._id, { role: e.target.value })}
              renderValue={(v) => (
                <Chip
                  label={v}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    bgcolor: v === 'admin' ? 'primary.main' : 'action.selected',
                    color: v === 'admin' ? '#fff' : 'text.primary',
                  }}
                />
              )}
              sx={{ '& .MuiSelect-select': { py: 0, pr: '20px !important' } }}
            >
              <MenuItem value="member">Member</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
        )}

        {/* Actions */}
        <Box className="row-actions" sx={{ opacity: { xs: 1, sm: 0 }, transition: 'opacity 0.15s', width: 36, textAlign: 'right' }}>
          {deactivated ? (
            <Tooltip title="Reactivate user">
              <IconButton size="small" onClick={() => onReactivate(user)}>
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Deactivate user">
              <IconButton size="small" onClick={() => onDeactivate(user)}>
                <PersonOffIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  useEffect(() => {
    getUsers().then(data => setUsers(data)).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving(true);
    const created = await createUser({ name: newName.trim(), email: newEmail.trim(), role: newRole });
    setUsers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName(''); setNewEmail(''); setNewRole('member');
    setCreateOpen(false);
    setSaving(false);
  };

  const handleUpdate = async (id, patch) => {
    const updated = await updateUser(id, patch);
    setUsers(prev => prev.map(u => u._id === updated._id ? updated : u));
  };

  const handleDeactivate = async () => {
    await deleteUser(deactivateTarget._id);
    setUsers(prev => prev.map(u => u._id === deactivateTarget._id ? { ...u, deactivated: true } : u));
    setDeactivateTarget(null);
  };

  const handleReactivate = async (user) => {
    await handleUpdate(user._id, { deactivated: false });
  };

  const active = users.filter(u => !u.deactivated);
  const deactivated = users.filter(u => u.deactivated);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
      <Box sx={{ maxWidth: 720, mx: 'auto', px: 3, py: 5 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PeopleOutlineIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="h5">People</Typography>
            <Chip label={active.length} size="small" sx={{ fontWeight: 600 }} />
          </Box>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
            Add user
          </Button>
        </Box>

        {/* Active users */}
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5, mb: 4 }}>
          {active.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No active users
            </Typography>
          ) : (
            active.map((u, i) => (
              <UserRow
                key={u._id}
                user={u}
                divider={i > 0}
                onUpdate={handleUpdate}
                onDeactivate={setDeactivateTarget}
                onReactivate={handleReactivate}
              />
            ))
          )}
        </Paper>

        {/* Deactivated users */}
        {deactivated.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 0.5 }}>
              Deactivated · {deactivated.length}
            </Typography>
            <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5 }}>
              {deactivated.map((u, i) => (
                <UserRow
                  key={u._id}
                  user={u}
                  divider={i > 0}
                  onUpdate={handleUpdate}
                  onDeactivate={setDeactivateTarget}
                  onReactivate={handleReactivate}
                />
              ))}
            </Paper>
          </>
        )}
      </Box>

      {/* Create user dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add user</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField
            autoFocus
            size="small"
            label="Full name"
            fullWidth
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <TextField
            size="small"
            label="Email"
            type="email"
            fullWidth
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
          />
          <FormControl size="small" fullWidth>
            <Select value={newRole} onChange={e => setNewRole(e.target.value)}>
              <MenuItem value="member">Member</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saving || !newName.trim() || !newEmail.trim()}
            onClick={handleCreate}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate confirm dialog */}
      <Dialog open={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Deactivate user?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{deactivateTarget?.name}</strong> will be deactivated and won't be able to log in.
            Their cards and comments are not affected, and you can reactivate them anytime.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeactivateTarget(null)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDeactivate}
            sx={{ bgcolor: '#f44336', '&:hover': { bgcolor: '#d32f2f' } }}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
