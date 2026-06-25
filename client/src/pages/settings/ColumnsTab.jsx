import { useState } from 'react';
import {
  Box, Typography, IconButton, TextField, Button, Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import api from '../../api/client';

export default function ColumnsTab({ boardId, columns, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newName, setNewName] = useState('');

  const startEdit = (col) => {
    setEditingId(col._id);
    setEditName(col.name);
    setEditColor(col.color || '#9aa0aa');
  };

  const saveEdit = async (col) => {
    const updated = await api.put(`/columns/${col._id}`, { name: editName, color: editColor }).then(r => r.data);
    onChange(columns.map(c => c._id === updated._id ? updated : c));
    setEditingId(null);
  };

  const handleDelete = async (col) => {
    await api.delete(`/columns/${col._id}`);
    onChange(columns.filter(c => c._id !== col._id));
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const created = await api.post(`/boards/${boardId}/columns`, { name: newName.trim() }).then(r => r.data);
    onChange([...columns, created]);
    setNewName('');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {columns.map(col => (
          <Box
            key={col._id}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.25,
              px: 1.25, py: 1, borderRadius: 1.5, minHeight: 44,
              '&:hover': { bgcolor: 'action.hover' },
              '&:hover .row-actions': { opacity: 1 },
              transition: 'background-color 0.15s',
            }}
          >
            {editingId === col._id ? (
              <Box sx={{ display: 'flex', gap: 1, flex: 1, alignItems: 'center' }}>
                <Box
                  component="input"
                  type="color"
                  value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  sx={{ width: 32, height: 32, p: 0, border: 'none', bgcolor: 'transparent', cursor: 'pointer', borderRadius: 1, flexShrink: 0 }}
                />
                <TextField
                  size="small" value={editName} onChange={e => setEditName(e.target.value)}
                  sx={{ flex: 1 }} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(col); if (e.key === 'Escape') setEditingId(null); }}
                />
                <Tooltip title="Save"><IconButton size="small" color="primary" onClick={() => saveEdit(col)}><CheckIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Cancel"><IconButton size="small" onClick={() => setEditingId(null)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
            ) : (
              <>
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: col.color || '#9aa0aa', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>{col.name}</Typography>
                <Box className="row-actions" sx={{ display: 'flex', gap: 0.25, opacity: { xs: 1, sm: 0 }, transition: 'opacity 0.15s' }}>
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => startEdit(col)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete (must be empty)"><IconButton size="small" onClick={() => handleDelete(col)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                </Box>
              </>
            )}
          </Box>
        ))}
        {columns.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No columns yet.</Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small" placeholder="New column name…" value={newName}
          onChange={e => setNewName(e.target.value)} sx={{ flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Button variant="contained" size="small" startIcon={<AddIcon />} disabled={!newName.trim()} onClick={handleAdd}>Add</Button>
      </Box>
    </Box>
  );
}
