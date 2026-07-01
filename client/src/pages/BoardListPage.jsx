import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Avatar, CircularProgress, Divider, IconButton,
  Button, Menu, MenuItem, ListItemIcon, Tooltip, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
} from '@mui/material';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleAltOutlined';
import AddIcon from '@mui/icons-material/Add';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { getBoards, createBoard, updateBoard, deleteBoard } from '../api/boards';
import { getUsers } from '../api/users';
import { userColor } from '../utils/userColor';

// Asana-style coral/teal/purple palette for project icons, picked deterministically by name.
const BOARD_COLORS = ['#00897b', '#4573d2', '#5da283', '#aa62e3', '#e8a33d', '#3aa9bd', '#d35a8c'];
const colorFor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return BOARD_COLORS[Math.abs(hash) % BOARD_COLORS.length];
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';

const notifyBoardsChanged = () => window.dispatchEvent(new CustomEvent('boards:changed'));

function WidgetCard({ icon, title, action, children }) {
  return (
    <Paper variant="outlined" sx={{ flex: 1, minWidth: 320, borderRadius: 3, p: 2.5, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {icon}
        <Typography fontWeight={700} fontSize={16}>{title}</Typography>
        {action && <Box sx={{ ml: 'auto' }}>{action}</Box>}
      </Box>
      {children}
    </Paper>
  );
}

function BoardRow({ board, onOpen, onMenu, dimmed }) {
  return (
    <Box
      onClick={() => onOpen(board)}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 1, py: 1, borderRadius: 1.5, cursor: 'pointer',
        opacity: dimmed ? 0.6 : 1,
        '&:hover': { bgcolor: 'action.hover' },
        '&:hover .board-menu-btn': { opacity: 1 },
        transition: 'background-color 0.15s',
      }}
    >
      <Box sx={{ width: 36, height: 36, borderRadius: 1.5, flexShrink: 0, bgcolor: colorFor(board.name), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ViewKanbanOutlinedIcon sx={{ fontSize: 18, color: '#fff' }} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap>{board.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {board.columnCount ?? 0} column{board.columnCount === 1 ? '' : 's'}
          {board.cardCount ? ` · ${board.cardCount} card${board.cardCount === 1 ? '' : 's'}` : ''}
        </Typography>
      </Box>
      <IconButton
        className="board-menu-btn"
        size="small"
        onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget, board); }}
        sx={{ opacity: { xs: 1, sm: 0 }, transition: 'opacity 0.15s' }}
      >
        <MoreHorizIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function BoardListPage() {
  const [boards, setBoards] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuBoard, setMenuBoard] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getBoards().catch(() => []), getUsers().catch(() => [])])
      .then(([boardData, userData]) => { setBoards(boardData); setUsers(userData); })
      .finally(() => setLoading(false));
  }, []);

  const openMenu = (anchor, board) => { setMenuAnchor(anchor); setMenuBoard(board); };
  const closeMenu = () => { setMenuAnchor(null); setMenuBoard(null); };

  const handleCreate = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createBoard({ name: newName.trim() });
      setBoards(prev => [...prev, { ...created, columnCount: 3, cardCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      notifyBoardsChanged();
      setCreateOpen(false); setNewName('');
      navigate(`/boards/${created._id}`);
    } finally { setBusy(false); }
  };

  const handleRename = async () => {
    if (!renameName.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await updateBoard(renameTarget._id, { name: renameName.trim() });
      setBoards(prev => prev.map(b => b._id === updated._id ? { ...b, name: updated.name } : b));
      notifyBoardsChanged();
      setRenameTarget(null);
    } finally { setBusy(false); }
  };

  const handleArchiveToggle = async (board) => {
    closeMenu();
    const updated = await updateBoard(board._id, { isArchived: !board.isArchived });
    setBoards(prev => prev.map(b => b._id === updated._id ? { ...b, isArchived: updated.isArchived } : b));
    notifyBoardsChanged();
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await deleteBoard(deleteTarget._id);
      setBoards(prev => prev.filter(b => b._id !== deleteTarget._id));
      notifyBoardsChanged();
      setDeleteTarget(null);
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Could not delete the board.');
    } finally { setBusy(false); }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  const active = boards.filter(b => !b.isArchived);
  const archived = boards.filter(b => b.isArchived);
  const canDelete = (b) => b.isArchived || (b.cardCount ?? 0) === 0;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
      <Box sx={{ maxWidth: 1000, mx: 'auto', px: 3, py: 5 }}>
        {/* Greeting header */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>{today}</Typography>
          <Typography variant="h4" fontWeight={500}>{greeting()}, Dev User</Typography>
        </Box>

        {/* Widgets */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Projects (Boards) */}
          <WidgetCard
            icon={<ViewKanbanOutlinedIcon sx={{ color: 'text.secondary' }} />}
            title="Projects"
            action={
              <Button size="small" startIcon={<AddIcon />} onClick={() => { setNewName(''); setCreateOpen(true); }}>
                New board
              </Button>
            }
          >
            {active.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No boards yet. Create your first one.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {active.map(b => (
                  <BoardRow key={b._id} board={b} onOpen={(x) => navigate(`/boards/${x._id}`)} onMenu={openMenu} />
                ))}
              </Box>
            )}

            {/* Archived boards */}
            {archived.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Divider sx={{ mb: 0.5 }} />
                <Box
                  onClick={() => setShowArchived(s => !s)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.75, borderRadius: 1.5, cursor: 'pointer', color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  {showArchived ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  <Typography variant="caption" fontWeight={700}>Archived · {archived.length}</Typography>
                </Box>
                <Collapse in={showArchived}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {archived.map(b => (
                      <BoardRow key={b._id} board={b} dimmed onOpen={(x) => navigate(`/boards/${x._id}`)} onMenu={openMenu} />
                    ))}
                  </Box>
                </Collapse>
              </Box>
            )}
          </WidgetCard>

          {/* People (Users) */}
          <WidgetCard icon={<PeopleOutlineIcon sx={{ color: 'text.secondary' }} />} title="People">
            {users.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No people yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {users.map((u, i) => (
                  <Box key={u._id}>
                    {i > 0 && <Divider />}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ width: 36, height: 36, fontSize: 13, bgcolor: userColor(u) }}>{initials(u.name)}</Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{u.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{u.email}</Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </WidgetCard>
        </Box>
      </Box>

      {/* Board actions menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={() => { setRenameTarget(menuBoard); setRenameName(menuBoard.name); closeMenu(); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>Rename
        </MenuItem>
        <MenuItem onClick={() => handleArchiveToggle(menuBoard)}>
          <ListItemIcon>{menuBoard?.isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}</ListItemIcon>
          {menuBoard?.isArchived ? 'Unarchive' : 'Archive'}
        </MenuItem>
        {menuBoard && canDelete(menuBoard) ? (
          <MenuItem onClick={() => { setDeleteTarget(menuBoard); setError(''); closeMenu(); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>Delete
          </MenuItem>
        ) : (
          <Tooltip title="Archive the board first to delete a board that has cards" placement="left">
            <Box>
              <MenuItem disabled>
                <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>Delete
              </MenuItem>
            </Box>
          </Tooltip>
        )}
      </Menu>

      {/* Create board dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New board</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField
            autoFocus fullWidth size="small" label="Board name" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Starts with To Do / Doing / Done columns — edit them anytime in Settings.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button variant="contained" disabled={busy || !newName.trim()} onClick={handleCreate}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onClose={() => setRenameTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename board</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField
            autoFocus fullWidth size="small" label="Board name" value={renameName}
            onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRenameTarget(null)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button variant="contained" disabled={busy || !renameName.trim()} onClick={handleRename}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onClose={() => !busy && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete board?</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Typography variant="body2">
            <strong>{deleteTarget?.name}</strong> and everything in it
            {deleteTarget?.cardCount ? ` — ${deleteTarget.cardCount} card${deleteTarget.cardCount === 1 ? '' : 's'}, ` : ' — '}
            comments, subtasks, columns, fields, and templates will be permanently deleted.
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={busy} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button variant="contained" onClick={handleDelete} disabled={busy}
            sx={{ bgcolor: '#f44336', '&:hover': { bgcolor: '#d32f2f' } }}>
            {busy ? <CircularProgress size={22} color="inherit" /> : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
