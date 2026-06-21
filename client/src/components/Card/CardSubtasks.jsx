import { useState } from 'react';
import {
  Box, Typography, Checkbox, TextField, IconButton,
  List, ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import { createSubtask, updateSubtask, deleteSubtask } from '../../api/subtasks';

export default function CardSubtasks({ cardId, subtasks, onChange }) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleToggle = async (subtask) => {
    const updated = await updateSubtask(subtask._id, { isComplete: !subtask.isComplete });
    onChange(subtasks.map(s => s._id === updated._id ? updated : s));
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const created = await createSubtask(cardId, { title: newTitle.trim() });
    onChange([...subtasks, created]);
    setNewTitle('');
    setAdding(false);
  };

  const handleDelete = async (id) => {
    await deleteSubtask(id);
    onChange(subtasks.filter(s => s._id !== id));
  };

  const done = subtasks.filter(s => s.isComplete).length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          Subtasks {subtasks.length > 0 && `(${done}/${subtasks.length})`}
        </Typography>
        <IconButton size="small" onClick={() => setAdding(true)}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      <List dense disablePadding>
        {subtasks.map(sub => (
          <ListItem
            key={sub._id}
            disablePadding
            secondaryAction={
              <IconButton edge="end" size="small" onClick={() => handleDelete(sub._id)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Checkbox
                size="small"
                checked={sub.isComplete}
                onChange={() => handleToggle(sub)}
                sx={{ p: 0.5 }}
              />
            </ListItemIcon>
            <ListItemText
              primary={sub.title}
              slotProps={{
                primary: {
                  variant: 'body2',
                  sx: { textDecoration: sub.isComplete ? 'line-through' : 'none', color: sub.isComplete ? 'text.secondary' : 'text.primary' },
                },
              }}
            />
          </ListItem>
        ))}
      </List>

      {adding && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Subtask title…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
          />
          <IconButton size="small" onClick={handleAdd}><AddIcon /></IconButton>
        </Box>
      )}
    </Box>
  );
}
