import { useState } from 'react';
import {
  Box, Typography, Checkbox, TextField, IconButton, Tooltip, Avatar,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import { createSubtask, updateSubtask, deleteSubtask } from '../../api/subtasks';
import { formatDueRelative, dueExact, isOverdue } from '../../utils/dueDate';
import { userColor } from '../../utils/userColor';
import SubtaskDialog from './SubtaskDialog';

// Subtask list. A row shows what Asana's does — done state, title, due date, assignee —
// and clicking the title opens the subtask's own detail (SubtaskDialog), because a
// subtask carries assignee/dueDate/notes that were previously unreachable.

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

export default function CardSubtasks({ cardId, subtasks, onChange, users = [], parentTitle, readOnly = false }) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);

  const patch = async (id, data) => {
    const updated = await updateSubtask(id, data);
    onChange(subtasks.map(s => (s._id === updated._id ? updated : s)));
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    setNewTitle('');
    if (!title) { setAdding(false); return; }
    const created = await createSubtask(cardId, { title });
    onChange([...subtasks, created]);
    // Stay open: subtasks are added in runs ("Opts 6.3", "Opts 7.3", …).
  };

  const handleDelete = async (id) => {
    await deleteSubtask(id);
    onChange(subtasks.filter(s => s._id !== id));
    setOpenId(null);
  };

  const done = subtasks.filter(s => s.isComplete).length;
  const open = subtasks.find(s => s._id === openId) || null;

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={0.5}>
        Subtasks {subtasks.length > 0 && `(${done}/${subtasks.length})`}
      </Typography>

      <Box>
        {subtasks.map(sub => {
          const assignee = users.find(u => u._id?.toString() === sub.assigneeId?.toString());
          const overdue = isOverdue(sub.dueDate);
          return (
            <Box
              key={sub._id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                borderBottom: '1px solid', borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
                '&:hover .sub-del': { opacity: 1 },
              }}
            >
              <Checkbox
                size="small"
                checked={!!sub.isComplete}
                disabled={readOnly}
                onChange={() => patch(sub._id, { isComplete: !sub.isComplete })}
                sx={{ p: 0.5 }}
              />
              {/* Title opens the detail. The checkbox stays a separate hit target so
                  ticking something off never opens a dialog you didn't ask for. */}
              <Typography
                className="sub-title"
                variant="body2"
                onClick={() => setOpenId(sub._id)}
                sx={{
                  flex: 1, minWidth: 0, py: 0.75, cursor: 'pointer',
                  color: sub.isComplete ? 'text.disabled' : 'text.primary',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {sub.title}
              </Typography>

              {sub.dueDate && (
                <Tooltip title={dueExact(sub.dueDate)}>
                  <Typography
                    variant="caption"
                    sx={{ flexShrink: 0, color: overdue ? 'error.main' : 'text.secondary', fontWeight: overdue ? 600 : 400 }}
                  >
                    {formatDueRelative(sub.dueDate)}
                  </Typography>
                </Tooltip>
              )}

              {assignee && (
                <Tooltip title={assignee.name}>
                  <Avatar sx={{ width: 20, height: 20, fontSize: 9, bgcolor: userColor(assignee), flexShrink: 0 }}>
                    {initials(assignee.name)}
                  </Avatar>
                </Tooltip>
              )}

              {!readOnly && (
                <IconButton
                  className="sub-del"
                  size="small"
                  onClick={() => handleDelete(sub._id)}
                  sx={{ opacity: 0, transition: 'opacity .12s' }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Persistent "Add subtask" at the END of the list (Asana's placement) rather than a
          + button in the header — you decide to add one after reading what's there. */}
      {!readOnly && (adding ? (
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="Type to add a subtask…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
            if (e.key === 'Escape') { setNewTitle(''); setAdding(false); }
          }}
          onBlur={handleAdd}
          sx={{ mt: 1 }}
        />
      ) : (
        <Typography
          className="sub-add"
          variant="body2"
          onClick={() => setAdding(true)}
          sx={{
            mt: 1, py: 0.5, cursor: 'pointer', color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          Add subtask
        </Typography>
      ))}

      <SubtaskDialog
        open={!!open}
        subtask={open}
        parentTitle={parentTitle}
        users={users}
        readOnly={readOnly}
        onSave={data => patch(open._id, data)}
        onReplace={updated => onChange(subtasks.map(s => (s._id === updated._id ? updated : s)))}
        onDelete={() => handleDelete(open._id)}
        onClose={() => setOpenId(null)}
      />
    </Box>
  );
}
