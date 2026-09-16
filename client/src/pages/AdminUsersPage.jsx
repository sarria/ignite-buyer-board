import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Avatar, IconButton, Button, TextField,
  Select, MenuItem, FormControl, Tooltip, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, Divider, InputBase,
  InputAdornment, Alert, Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import PeopleOutlineIcon from '@mui/icons-material/PeopleAltOutlined';
import { getUsers, createUser, updateUser, deleteUser, mergeUser } from '../api/users';
import { userColor } from '../utils/userColor';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'email', label: 'Email (A-Z)' },
  { value: 'recent', label: 'Recently active' },
];

function sortUsers(list, sortBy) {
  const sorted = [...list];
  if (sortBy === 'email') sorted.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
  else if (sortBy === 'recent') {
    sorted.sort((a, b) => new Date(b.lastLoginAt || 0) - new Date(a.lastLoginAt || 0));
  } else {
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  return sorted;
}

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

function UserRow({ user, divider, onUpdate, onDeactivate, onReactivate, onMerge }) {
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
        <Box className="row-actions" sx={{ opacity: { xs: 1, sm: 0 }, transition: 'opacity 0.15s', display: 'flex' }}>
          <Tooltip title="Merge into another user (reassign their cards, comments, etc.)">
            <IconButton size="small" onClick={() => onMerge(user)}>
              <CallMergeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
  const [newRole, setNewRole] = useState('admin'); // go-live default; see server/controllers/users.js
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [mergeTarget, setMergeTarget] = useState(null); // the user being merged AWAY
  const [mergeIntoId, setMergeIntoId] = useState('');
  const [mergeConfirmText, setMergeConfirmText] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    getUsers().then(data => setUsers(data)).finally(() => setLoading(false));
  }, []);

  // Reset the typed confirmation whenever a new merge target opens (or the dialog
  // closes) — selecting a target from the dropdown must never be enough on its own
  // to arm this, since it's an irreversible delete.
  useEffect(() => {
    setMergeIntoId('');
    setMergeConfirmText('');
    setMergeError('');
  }, [mergeTarget]);

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving(true);
    const created = await createUser({ name: newName.trim(), email: newEmail.trim(), role: newRole });
    setUsers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName(''); setNewEmail(''); setNewRole('admin');
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

  const handleMerge = async () => {
    if (!mergeIntoId || merging) return;
    setMerging(true);
    setMergeError('');
    try {
      const result = await mergeUser(mergeTarget._id, mergeIntoId);
      setUsers(prev => prev.filter(u => u._id !== mergeTarget._id));
      const reassignedTotal = Object.values(result.reassigned || {}).reduce((a, b) => a + b, 0);
      setToast(`Merged ${result.merged} into ${result.into} — ${reassignedTotal} record${reassignedTotal === 1 ? '' : 's'} reassigned.`);
      setMergeTarget(null);
    } catch (e) {
      setMergeError(e.response?.data?.error?.message || 'Could not merge these users.');
    } finally {
      setMerging(false);
    }
  };

  const q = search.trim().toLowerCase();
  const matchesSearch = (u) => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  const filtered = users.filter(matchesSearch);
  const active = sortUsers(filtered.filter(u => !u.deactivated), sortBy);
  const deactivated = sortUsers(filtered.filter(u => u.deactivated), sortBy);
  const mergeCandidates = useMemo(
    () => users.filter(u => u._id !== mergeTarget?._id).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [users, mergeTarget]
  );

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

        {/* Search + sort */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <TextField
            size="small"
            placeholder="Search by name or email"
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ flex: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <Select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
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
                onMerge={setMergeTarget}
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
                  onMerge={setMergeTarget}
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

      {/* Merge dialog — reassigns cards/subtasks/comments/boards/templates from
          mergeTarget into the chosen user, then deletes mergeTarget. */}
      <Dialog open={!!mergeTarget} onClose={() => !merging && setMergeTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Merge user</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          {mergeError && <Alert severity="error">{mergeError}</Alert>}
          <Typography variant="body2">
            Every card, subtask, comment, board and template assigned to{' '}
            <strong>{mergeTarget?.name}</strong> ({mergeTarget?.email}) will be reassigned to
            the user below, then <strong>{mergeTarget?.name}</strong> will be deleted. This is
            typically needed when a buyer's Microsoft sign-in email doesn't match the email
            their Asana-imported data uses, leaving two separate records.
          </Typography>
          <FormControl size="small" fullWidth>
            <Select
              displayEmpty
              value={mergeIntoId}
              onChange={e => setMergeIntoId(e.target.value)}
            >
              <MenuItem value="" disabled>Merge into…</MenuItem>
              {mergeCandidates.map(u => (
                <MenuItem key={u._id} value={u._id}>{u.name} ({u.email})</MenuItem>
              ))}
            </Select>
          </FormControl>

          {mergeIntoId && (
            <TextField
              size="small"
              fullWidth
              autoFocus
              label={`Type "${mergeTarget?.email}" to confirm`}
              value={mergeConfirmText}
              onChange={e => setMergeConfirmText(e.target.value)}
              helperText="This permanently deletes that user and cannot be undone."
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMergeTarget(null)} disabled={merging} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleMerge}
            disabled={merging || !mergeIntoId || mergeConfirmText.trim().toLowerCase() !== mergeTarget?.email?.toLowerCase()}
          >
            {merging ? <CircularProgress size={22} color="inherit" /> : 'Merge'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
