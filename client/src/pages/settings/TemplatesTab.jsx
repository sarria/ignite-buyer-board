import { useState } from 'react';
import {
  Box, Typography, Button, TextField, IconButton, Divider,
  List, ListItem, ListItemText, Collapse, Tooltip,
  Select, MenuItem, FormControl, InputLabel, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createTemplate, updateTemplate, deleteTemplate, reorderTemplates } from '../../api/templates';

const HEALTH_COLORS = {
  'Good': '#4caf50',
  'Ok': '#ff9800',
  'Needs Work': '#f44336',
  'Waiting on DCM': '#2196f3',
};

function SubtaskEditor({ subtasks, onChange }) {
  const [newTitle, setNewTitle] = useState('');

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onChange([...subtasks, { title: newTitle.trim(), dueDateOffsetDays: 0 }]);
    setNewTitle('');
  };

  const handleRemove = (i) => onChange(subtasks.filter((_, idx) => idx !== i));

  const handleOffsetChange = (i, val) => {
    onChange(subtasks.map((s, idx) => idx === i ? { ...s, dueDateOffsetDays: Number(val) } : s));
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>Default subtasks</Typography>
      <List dense disablePadding sx={{ mt: 0.5 }}>
        {subtasks.map((s, i) => (
          <ListItem key={i} disablePadding sx={{ gap: 1, mb: 0.5 }}>
            <ListItemText primary={s.title} slotProps={{ primary: { variant: 'body2' } }} />
            <Tooltip title="Due date offset (days from card creation)">
              <TextField
                size="small"
                type="number"
                placeholder="+days"
                value={s.dueDateOffsetDays || 0}
                onChange={e => handleOffsetChange(i, e.target.value)}
                sx={{ width: 70 }}
                slotProps={{ input: { min: 0, style: { textAlign: 'center' } } }}
              />
            </Tooltip>
            <IconButton size="small" onClick={() => handleRemove(i)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <TextField
          size="small"
          placeholder="Subtask title…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          sx={{ flex: 1 }}
        />
        <IconButton size="small" onClick={handleAdd}><AddIcon /></IconButton>
      </Box>
    </Box>
  );
}

function FieldValuesEditor({ fields, fieldValues, onChange }) {
  const getVal = (fieldId) => {
    const fv = fieldValues.find(v => v.fieldId?.toString() === fieldId?.toString());
    if (!fv) return '';
    return fv.valueEnum ?? fv.valueText ?? fv.valueNumber ?? '';
  };

  const setVal = (field, val) => {
    const without = fieldValues.filter(v => v.fieldId?.toString() !== field._id?.toString());
    if (val === '' || val === null || val === undefined) { onChange(without); return; }
    const fv = { fieldId: field._id };
    if (field.type === 'enum') fv.valueEnum = val;
    else if (field.type === 'number') fv.valueNumber = Number(val);
    else fv.valueText = val;
    onChange([...without, fv]);
  };

  if (!fields.length) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>Default field values</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.75 }}>
        {fields.map(field => (
          <Box key={field._id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2" sx={{ minWidth: 100, color: 'text.secondary' }}>{field.name}</Typography>
            {field.type === 'enum' ? (
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select
                  value={getVal(field._id)}
                  onChange={e => setVal(field, e.target.value)}
                  displayEmpty
                  renderValue={v => v
                    ? (field.name === 'Health'
                      ? <Chip label={v} size="small" sx={{ bgcolor: HEALTH_COLORS[v], color: '#fff', height: 20, fontSize: 11 }} />
                      : v)
                    : <em style={{ color: '#999' }}>None</em>
                  }
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {field.options.map(o => (
                    <MenuItem key={o} value={o}>
                      {field.name === 'Health'
                        ? <Chip label={o} size="small" sx={{ bgcolor: HEALTH_COLORS[o], color: '#fff', height: 20, fontSize: 11 }} />
                        : o}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                size="small"
                type={field.type === 'number' ? 'number' : 'text'}
                placeholder={`Default ${field.name.toLowerCase()}…`}
                value={getVal(field._id)}
                onChange={e => setVal(field, e.target.value)}
                sx={{ flex: 1 }}
              />
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function TemplateRow({ template, columns, fields, users, onSave, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.descriptionTemplate || '');
  const [defaultColumnId, setDefaultColumnId] = useState(template.defaultColumnId?.toString() || '');
  const [defaultAssigneeId, setDefaultAssigneeId] = useState(template.defaultAssigneeId?.toString() || '');
  const [dueDateOffsetDays, setDueDateOffsetDays] = useState(template.dueDateOffsetDays ?? '');
  const [defaultFieldValues, setDefaultFieldValues] = useState(template.defaultFieldValues || []);
  const [subtasks, setSubtasks] = useState(template.defaultSubtasks || []);
  const [saving, setSaving] = useState(false);

  const dirty = name !== template.name
    || description !== (template.descriptionTemplate || '')
    || defaultColumnId !== (template.defaultColumnId?.toString() || '')
    || defaultAssigneeId !== (template.defaultAssigneeId?.toString() || '')
    || String(dueDateOffsetDays) !== String(template.dueDateOffsetDays ?? '')
    || JSON.stringify(defaultFieldValues) !== JSON.stringify(template.defaultFieldValues || [])
    || JSON.stringify(subtasks) !== JSON.stringify(template.defaultSubtasks || []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const updated = await updateTemplate(template._id, {
      name: name.trim(),
      descriptionTemplate: description,
      defaultColumnId: defaultColumnId || null,
      defaultAssigneeId: defaultAssigneeId || null,
      dueDateOffsetDays: dueDateOffsetDays !== '' ? Number(dueDateOffsetDays) : null,
      defaultFieldValues,
      defaultSubtasks: subtasks,
    });
    onSave(updated);
    setSaving(false);
  };

  return (
    <Box ref={setNodeRef} style={style} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, mb: 1.5, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, gap: 1 }}>
        <Box {...attributes} {...listeners} sx={{ cursor: 'grab', color: 'text.disabled', '&:hover': { color: 'text.secondary' }, display: 'flex', mr: 0.5 }}>
          <DragIndicatorIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: 'left' }}>{template.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {(template.defaultSubtasks || []).length} subtask{(template.defaultSubtasks || []).length !== 1 ? 's' : ''}
        </Typography>
        <Tooltip title="Delete template">
          <IconButton size="small" onClick={() => onDelete(template._id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField size="small" label="Template name" fullWidth value={name} onChange={e => setName(e.target.value)} />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Default column</InputLabel>
              <Select value={defaultColumnId} label="Default column" onChange={e => setDefaultColumnId(e.target.value)}>
                <MenuItem value=""><em>None</em></MenuItem>
                {columns.map(c => <MenuItem key={c._id} value={c._id.toString()}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Default assignee</InputLabel>
              <Select value={defaultAssigneeId} label="Default assignee" onChange={e => setDefaultAssigneeId(e.target.value)}>
                <MenuItem value=""><em>None</em></MenuItem>
                {users.map(u => <MenuItem key={u._id} value={u._id.toString()}>{u.name}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField
              size="small"
              type="number"
              label="Due date +days"
              value={dueDateOffsetDays}
              onChange={e => setDueDateOffsetDays(e.target.value)}
              sx={{ width: 120 }}
              slotProps={{ input: { min: 0 } }}
            />
          </Box>

          <TextField
            size="small"
            label="Description template"
            fullWidth
            multiline
            minRows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Pre-fill card description…"
          />

          <FieldValuesEditor fields={fields} fieldValues={defaultFieldValues} onChange={setDefaultFieldValues} />

          <SubtaskEditor subtasks={subtasks} onChange={setSubtasks} />

          {dirty && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                variant="contained"
                disabled={saving || !name.trim()}
                onClick={handleSave}              >
                Save
              </Button>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function TemplatesTab({ boardId, templates, columns, fields, users, onChange }) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const created = await createTemplate(boardId, { name: newName.trim() });
    onChange([...templates, created]);
    setNewName('');
    setAdding(false);
    setSaving(false);
  };

  const handleSave = (updated) => onChange(templates.map(t => t._id === updated._id ? updated : t));
  const handleDelete = async (id) => {
    await deleteTemplate(id);
    onChange(templates.filter(t => t._id !== id));
  };

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = templates.findIndex(t => t._id === active.id);
    const newIndex = templates.findIndex(t => t._id === over.id);
    const reordered = arrayMove(templates, oldIndex, newIndex);
    onChange(reordered);
    await reorderTemplates(boardId, reordered.map(t => t._id));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Templates pre-fill cards with default values. Apply when creating a new card or from within an existing card.
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAdding(true)}
          color="primary"
          sx={{ flexShrink: 0, ml: 2 }}
        >
          New template
        </Button>
      </Box>

      {adding && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            autoFocus size="small" fullWidth placeholder="Template name…"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
          />
          <Button
            size="small" variant="contained" disabled={saving || !newName.trim()} onClick={handleCreate}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Create
          </Button>
          <Button size="small" onClick={() => { setAdding(false); setNewName(''); }} sx={{ textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
        </Box>
      )}

      {templates.length === 0 && !adding ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No templates yet. Create one to speed up card creation.
        </Typography>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={templates.map(t => t._id)} strategy={verticalListSortingStrategy}>
            {templates.map(t => (
              <TemplateRow
                key={t._id}
                template={t}
                columns={columns}
                fields={fields}
                users={users}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </Box>
  );
}
