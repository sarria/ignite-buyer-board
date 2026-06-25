import { useState } from 'react';
import {
  Box, IconButton, TextField, Button, Select, MenuItem,
  FormControl, InputLabel, Chip, Typography, Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import api from '../../api/client';

const FIELD_TYPES = ['text', 'number', 'date', 'url', 'enum'];

export default function FieldsTab({ boardId, fields, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('text');
  const [editOptions, setEditOptions] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newOptions, setNewOptions] = useState('');

  const startEdit = (field) => {
    setEditingId(field._id);
    setEditName(field.name);
    setEditType(field.type);
    setEditOptions((field.options || []).join(', '));
  };

  const saveEdit = async (field) => {
    const options = editType === 'enum' ? editOptions.split(',').map(o => o.trim()).filter(Boolean) : [];
    const updated = await api.put(`/fields/${field._id}`, { name: editName, type: editType, options }).then(r => r.data);
    onChange(fields.map(f => f._id === updated._id ? updated : f));
    setEditingId(null);
  };

  const handleDelete = async (field) => {
    await api.delete(`/fields/${field._id}`);
    onChange(fields.filter(f => f._id !== field._id));
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const options = newType === 'enum' ? newOptions.split(',').map(o => o.trim()).filter(Boolean) : [];
    const created = await api.post(`/boards/${boardId}/fields`, { name: newName.trim(), type: newType, options }).then(r => r.data);
    onChange([...fields, created]);
    setNewName('');
    setNewOptions('');
    setNewType('text');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {fields.map(field => (
          <Box
            key={field._id}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.25,
              px: 1.25, py: 1, borderRadius: 1.5, minHeight: 44,
              '&:hover': { bgcolor: 'action.hover' },
              '&:hover .row-actions': { opacity: 1 },
              transition: 'background-color 0.15s',
            }}
          >
            {editingId === field._id ? (
              <Box sx={{ display: 'flex', gap: 1, flex: 1, flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" value={editName} onChange={e => setEditName(e.target.value)} sx={{ flex: 1 }} autoFocus />
                  <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel>Type</InputLabel>
                    <Select value={editType} label="Type" onChange={e => setEditType(e.target.value)}>
                      {FIELD_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Tooltip title="Save"><IconButton size="small" color="primary" onClick={() => saveEdit(field)}><CheckIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Cancel"><IconButton size="small" onClick={() => setEditingId(null)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
                </Box>
                {editType === 'enum' && (
                  <TextField size="small" label="Options (comma-separated)" value={editOptions} onChange={e => setEditOptions(e.target.value)} fullWidth />
                )}
              </Box>
            ) : (
              <>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{field.name}</Typography>
                    <Chip
                      label={field.type}
                      size="small"
                      sx={{ height: 18, fontSize: 10, fontWeight: 600, bgcolor: 'action.selected' }}
                    />
                    {field.isRequired && <Chip label="required" size="small" sx={{ height: 18, fontSize: 10, fontWeight: 600, color: 'primary.main', bgcolor: '#4573d222' }} />}
                  </Box>
                  {field.type === 'enum' && field.options?.length > 0 && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
                      {field.options.join(' · ')}
                    </Typography>
                  )}
                </Box>
                <Box className="row-actions" sx={{ display: 'flex', gap: 0.25, opacity: { xs: 1, sm: 0 }, transition: 'opacity 0.15s' }}>
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => startEdit(field)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" onClick={() => handleDelete(field)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                </Box>
              </>
            )}
          </Box>
        ))}
        {fields.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No custom fields yet.</Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField size="small" placeholder="Field name…" value={newName} onChange={e => setNewName(e.target.value)} sx={{ flex: 1, minWidth: 140 }} />
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel>Type</InputLabel>
          <Select value={newType} label="Type" onChange={e => setNewType(e.target.value)}>
            {FIELD_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>
        {newType === 'enum' && (
          <TextField size="small" placeholder="Options (comma-separated)" value={newOptions} onChange={e => setNewOptions(e.target.value)} sx={{ flex: 2, minWidth: 200 }} />
        )}
        <Button variant="contained" size="small" startIcon={<AddIcon />} disabled={!newName.trim()} onClick={handleAdd}>Add</Button>
      </Box>
    </Box>
  );
}
