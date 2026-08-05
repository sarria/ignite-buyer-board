import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, Box, Typography, TextField, Select, MenuItem,
  FormControl, IconButton, Button, Tooltip, Divider, Avatar,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import DueDatePicker from '../common/DueDatePicker';
import { userColor } from '../../utils/userColor';

// Detail view for one subtask. Subtasks already carried assignee/dueDate/notes in the
// schema and the API already accepted them — there was just no way to see or set any of
// it, so a subtask was a bare title.
//
// A dialog rather than a nested drawer: the card drawer is already a panel pinned to the
// right, and sliding a second one out of it gets confusing about which "close" you're
// pressing. Asana pushes a full task pane; a modal is the honest small-app version.
//
// NOT here: comments. `comments` are keyed by cardId, so subtask comments need a schema
// change — worth doing deliberately, not smuggled into a UI change.

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

function Row({ label, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 0.75 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, pt: 1, fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

export default function SubtaskDialog({
  open, subtask, parentTitle, users = [], readOnly = false, onSave, onDelete, onClose,
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

  // Reset local drafts whenever a different subtask opens, or the title/notes of the
  // current one change underneath us.
  useEffect(() => {
    setTitle(subtask?.title || '');
    setNotes(subtask?.notes || '');
  }, [subtask?._id, subtask?.title, subtask?.notes]);

  if (!subtask) return null;
  const done = !!subtask.isComplete;

  // Text fields commit on blur rather than per keystroke — one request per edit, not one
  // per character, and it keeps the parent list from re-rendering as you type.
  const commitTitle = () => {
    const v = title.trim();
    if (v && v !== subtask.title) onSave({ title: v });
    else setTitle(subtask.title || '');
  };
  const commitNotes = () => {
    if (notes !== (subtask.notes || '')) onSave({ notes });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.5 }}>
        <Button
          size="small"
          variant={done ? 'contained' : 'outlined'}
          color={done ? 'success' : 'inherit'}
          disabled={readOnly}
          startIcon={done ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
          onClick={() => onSave({ isComplete: !done })}
          sx={{ textTransform: 'none' }}
        >
          {done ? 'Completed' : 'Mark complete'}
        </Button>
        <Box sx={{ flex: 1 }} />
        {!readOnly && (
          <Tooltip title="Delete subtask">
            <IconButton size="small" onClick={onDelete}><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <DialogContent sx={{ pt: 1 }}>
        {/* Breadcrumb to the parent card — a subtask out of context is meaningless, and
            these titles ("Opts 2.23") are only identifiable via their account. */}
        {parentTitle && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mb: 0.5 }}>
            {parentTitle} /
          </Typography>
        )}

        <TextField
          fullWidth
          variant="standard"
          value={title}
          disabled={readOnly}
          onChange={e => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
          slotProps={{ input: { disableUnderline: true, style: { fontSize: 20, fontWeight: 700 } } }}
          sx={{ mb: 1.5 }}
        />

        <Row label="Assignee">
          <FormControl size="small" fullWidth>
            <Select
              value={subtask.assigneeId?.toString() || ''}
              displayEmpty
              disabled={readOnly}
              onChange={e => onSave({ assigneeId: e.target.value || null })}
              renderValue={(v) => {
                const u = users.find(x => x._id?.toString() === v);
                if (!u) return <Typography variant="body2" color="text.secondary">No assignee</Typography>;
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: userColor(u) }}>
                      {initials(u.name)}
                    </Avatar>
                    <Typography variant="body2">{u.name}</Typography>
                  </Box>
                );
              }}
            >
              <MenuItem value="">No assignee</MenuItem>
              {users.map(u => (
                <MenuItem key={u._id} value={u._id.toString()}>{u.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Row>

        <Row label="Due date">
          <DueDatePicker
            value={subtask.dueDate}
            readOnly={readOnly}
            onChange={v => onSave({ dueDate: v })}
          />
        </Row>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="subtitle2" fontWeight={700} mb={1}>Description</Typography>
        <TextField
          fullWidth
          multiline
          minRows={4}
          placeholder={readOnly ? 'No description' : 'Add more detail…'}
          value={notes}
          disabled={readOnly}
          onChange={e => setNotes(e.target.value)}
          onBlur={commitNotes}
          slotProps={{ input: { sx: { fontSize: 14 } } }}
        />
      </DialogContent>
    </Dialog>
  );
}
