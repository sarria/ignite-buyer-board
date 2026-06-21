import { useState } from 'react';
import {
  Box, List, ListItem, ListItemText, IconButton, TextField,
  Button, Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../api/client';

export default function ColumnsTab({ boardId, columns, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newName, setNewName] = useState('');

  const startEdit = (col) => {
    setEditingId(col._id);
    setEditName(col.name);
    setEditColor(col.color || '#e0e0e0');
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
      <List disablePadding>
        {columns.map(col => (
          <ListItem
            key={col._id}
            disablePadding
            sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 1, px: 0 }}
          >
            {editingId === col._id ? (
              <Box sx={{ display: 'flex', gap: 1, flex: 1, alignItems: 'center' }}>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
                <TextField size="small" value={editName} onChange={e => setEditName(e.target.value)} sx={{ flex: 1 }} autoFocus onKeyDown={e => { if (e.key === 'Enter') saveEdit(col); if (e.key === 'Escape') setEditingId(null); }} />
                <IconButton size="small" onClick={() => saveEdit(col)}><CheckIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => setEditingId(null)}><CloseIcon fontSize="small" /></IconButton>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: col.color || '#e0e0e0', flexShrink: 0 }} />
                  <ListItemText
                    primary={col.name}
                    slotProps={{ primary: { variant: 'body2', fontWeight: 600 } }}
                  />
                </Box>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => startEdit(col)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete (must be empty)"><IconButton size="small" onClick={() => handleDelete(col)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
              </>
            )}
          </ListItem>
        ))}
      </List>

      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
        <TextField size="small" placeholder="New column name…" value={newName} onChange={e => setNewName(e.target.value)} sx={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} />
        <Button variant="contained" size="small" onClick={handleAdd}>Add</Button>
      </Box>
    </Box>
  );
}
