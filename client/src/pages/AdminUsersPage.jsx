import { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableHead, TableRow,
  Paper, IconButton, Button, TextField, Select, MenuItem, FormControl,
  Tooltip, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { getUsers, createUser, updateUser, deleteUser } from '../api/users';

function EditableCell({ value, onSave, type = 'text', options }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  const save = async () => {
    if (val !== value) await onSave(val);
    setEditing(false);
  };

  if (!editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => setEditing(true)}>
        {type === 'select' ? (
          <Chip
            label={value}
            size="small"
            sx={{ bgcolor: value === 'admin' ? '#4573d222' : 'action.hover', color: value === 'admin' ? 'primary.main' : 'text.primary', fontWeight: 600 }}
          />
        ) : (
          <Typography variant="body2">{value}</Typography>
        )}
        <EditIcon sx={{ fontSize: 13, color: 'text.disabled', opacity: 0 }} className="edit-icon" />
      </Box>
    );
  }

  if (type === 'select') {
    return (
      <FormControl size="small">
        <Select autoFocus value={val} onChange={e => setVal(e.target.value)} onBlur={save}>
          {options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
      </FormControl>
    );
  }

  return (
    <TextField
      autoFocus
      size="small"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
    />
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

  const active = users.filter(u => !u.deactivated);
  const deactivated = users.filter(u => u.deactivated);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto', p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h6" fontWeight={700}>User Management</Typography>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => setCreateOpen(true)}        >
          Add user
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'action.hover' } }}>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {active.map(user => (
              <TableRow key={user._id} hover sx={{ '&:hover .edit-icon': { opacity: 1 } }}>
                <TableCell>
                  <EditableCell value={user.name} onSave={val => handleUpdate(user._id, { name: val })} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{user.email}</Typography>
                </TableCell>
                <TableCell>
                  <EditableCell
                    value={user.role || 'member'}
                    type="select"
                    options={['member', 'admin']}
                    onSave={val => handleUpdate(user._id, { role: val })}
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Deactivate user">
                    <IconButton size="small" onClick={() => setDeactivateTarget(user)}>
                      <PersonOffIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {active.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>No active users</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {deactivated.length > 0 && (
        <>
          <Typography variant="subtitle2" color="text.secondary" mb={1}>Deactivated users</Typography>
          <Paper variant="outlined">
            <Table size="small">
              <TableBody>
                {deactivated.map(user => (
                  <TableRow key={user._id} sx={{ opacity: 0.5 }}>
                    <TableCell><Typography variant="body2">{user.name}</Typography></TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{user.email}</Typography></TableCell>
                    <TableCell><Chip label={user.role || 'member'} size="small" /></TableCell>
                    <TableCell align="right">
                      <Chip label="Deactivated" size="small" sx={{ bgcolor: 'action.disabledBackground' }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

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
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none', color: 'text.secondary' }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saving || !newName.trim() || !newEmail.trim()}
            onClick={handleCreate}          >
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
            Their cards and comments are not affected.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeactivateTarget(null)} sx={{ textTransform: 'none', color: 'text.secondary' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDeactivate}
            sx={{ bgcolor: '#f44336', '&:hover': { bgcolor: '#d32f2f' }, textTransform: 'none' }}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
