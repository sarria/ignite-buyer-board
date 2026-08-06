import { useState } from 'react';
import {
  Box, Typography, TextField, IconButton,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/Delete';
import { createSubtask, updateSubtask, deleteSubtask } from '../../api/subtasks';
import SubtaskDialog from './SubtaskDialog';
import CompleteToggle from '../common/CompleteToggle';
import AssigneeControl from '../common/AssigneeControl';
import DueDatePicker from '../common/DueDatePicker';

// Subtask list. A row shows what Asana's does — done state, title, due date, assignee —
// and clicking the title opens the subtask's own detail (SubtaskDialog), because a
// subtask carries assignee/dueDate/notes that were previously unreachable.

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
        {subtasks.map(sub => (
            <Box
              key={sub._id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                borderBottom: '1px solid', borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
                '&:hover .sub-del': { opacity: 1 },
              }}
            >
              <CompleteToggle
                done={!!sub.isComplete}
                disabled={readOnly}
                onToggle={() => patch(sub._id, { isComplete: !sub.isComplete })}
                size={16}
                sx={{ ml: 0.25 }}
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

              {/* Due date and assignee are set right here, same controls as a card —
                  opening the subtask dialog just to pick a date is a click too many. */}
              <DueDatePicker
                compact
                size={20}
                value={sub.dueDate}
                readOnly={readOnly}
                onChange={v => patch(sub._id, { dueDate: v })}
              />
              <AssigneeControl
                value={sub.assigneeId}
                users={users}
                size={20}
                readOnly={readOnly}
                onChange={id => patch(sub._id, { assigneeId: id })}
              />

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
        ))}
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
