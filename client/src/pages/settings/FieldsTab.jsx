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
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../api/client';
import { reorderFields } from '../../api/fields';

const FIELD_TYPES = ['text', 'number', 'date', 'url', 'enum'];

function FieldRow({
  field, editing, editName, editType, editOptions,
  setEditName, setEditType, setEditOptions, startEdit, saveEdit, cancelEdit, onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, minHeight: 44,
        px: 0.5, py: 1, borderRadius: 1.5,
        bgcolor: isDragging ? 'action.hover' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
        '&:hover .row-actions': { opacity: 1 },
        '&:hover .drag-handle': { color: 'text.secondary' },
        transition: 'background-color 0.15s',
      }}
    >
      {editing ? (
        <Box sx={{ display: 'flex', gap: 1, flex: 1, flexDirection: 'column', pl: 0.75 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField size="small" value={editName} onChange={e => setEditName(e.target.value)} sx={{ flex: 1 }} autoFocus />
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>Type</InputLabel>
              <Select value={editType} label="Type" onChange={e => setEditType(e.target.value)}>
                {FIELD_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <Tooltip title="Save"><IconButton size="small" color="primary" onClick={() => saveEdit(field)}><CheckIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Cancel"><IconButton size="small" onClick={cancelEdit}><CloseIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
          {editType === 'enum' && (
            <TextField size="small" label="Options (comma-separated)" value={editOptions} onChange={e => setEditOptions(e.target.value)} fullWidth />
          )}
        </Box>
      ) : (
        <>
          <Box
            {...attributes}
            {...listeners}
            className="drag-handle"
            sx={{ display: 'flex', alignItems: 'center', color: 'text.disabled', cursor: 'grab', '&:active': { cursor: 'grabbing' }, touchAction: 'none' }}
          >
            <DragIndicatorIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>{field.name}</Typography>
              <Chip label={field.type} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 600, bgcolor: 'action.selected' }} />
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
            <Tooltip title="Delete"><IconButton size="small" onClick={() => onDelete(field)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
        </>
      )}
    </Box>
  );
}

export default function FieldsTab({ boardId, fields, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('text');
  const [editOptions, setEditOptions] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newOptions, setNewOptions] = useState('');

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

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

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex(f => f._id === active.id);
    const newIndex = fields.findIndex(f => f._id === over.id);
    const reordered = arrayMove(fields, oldIndex, newIndex);
    onChange(reordered);
    await reorderFields(boardId, reordered.map(f => f._id));
  };

  return (
    <Box>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map(f => f._id)} strategy={verticalListSortingStrategy}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {fields.map(field => (
              <FieldRow
                key={field._id}
                field={field}
                editing={editingId === field._id}
                editName={editName}
                editType={editType}
                editOptions={editOptions}
                setEditName={setEditName}
                setEditType={setEditType}
                setEditOptions={setEditOptions}
                startEdit={startEdit}
                saveEdit={saveEdit}
                cancelEdit={() => setEditingId(null)}
                onDelete={handleDelete}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
      {fields.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No custom fields yet.</Typography>
      )}

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
