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
import RichTextField from '../common/RichTextField';
import RichContent from '../common/RichContent';
import Linkify from '../../utils/linkify';
import Attachments from '../common/Attachments';
import CardComments from './CardComments';
import { addSubtaskAttachment, removeSubtaskAttachment } from '../../api/subtasks';
import { getSubtaskComments, createSubtaskComment } from '../../api/comments';
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
  open, subtask, parentTitle, users = [], readOnly = false, onSave, onReplace, onDelete, onClose,
}) {
  const [title, setTitle] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [comments, setComments] = useState([]);

  // Fetched when the dialog opens rather than shipped with the card: a card can carry
  // 28 subtasks, and pre-loading every thread would bloat the card payload for threads
  // nobody opens.
  useEffect(() => {
    if (!open || !subtask?._id) { setComments([]); return undefined; }
    let cancelled = false;
    getSubtaskComments(subtask._id)
      .then(d => { if (!cancelled) setComments(d); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [open, subtask?._id]);

  // Reset local drafts whenever a different subtask opens, or the title/notes of the
  // current one change underneath us.
  useEffect(() => {
    setTitle(subtask?.title || '');
    setEditingNotes(false);
  }, [subtask?._id, subtask?.title]);

  if (!subtask) return null;
  const done = !!subtask.isComplete;

  // Text fields commit on blur rather than per keystroke — one request per edit, not one
  // per character, and it keeps the parent list from re-rendering as you type.
  const commitTitle = () => {
    const v = title.trim();
    if (v && v !== subtask.title) onSave({ title: v });
    else setTitle(subtask.title || '');
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
        {/* Same editor as a card's description — a subtask description is where buyers
            paste KPI blocks and screenshots, so plain text wasn't enough. Imported notes
            are plain text, so fall back to `notes` until it's edited once. */}
        {editingNotes && !readOnly ? (
          <RichTextField
            key={`sub-notes-${subtask._id}`}
            initialValue={subtask.notesHtml || subtask.notes || ''}
            minHeight={140}
            onSave={async (html) => {
              await onSave({ notes: html.replace(/<[^>]*>/g, '').trim(), notesHtml: html });
              setEditingNotes(false);
            }}
            onCancel={() => setEditingNotes(false)}
          />
        ) : (
          <Box
            onClick={() => { if (!readOnly) setEditingNotes(true); }}
            sx={{
              minHeight: 60, p: 1, borderRadius: 1,
              cursor: readOnly ? 'default' : 'text',
              '&:hover': { bgcolor: readOnly ? 'transparent' : 'action.hover' },
            }}
          >
            {subtask.notesHtml
              ? <RichContent html={subtask.notesHtml} />
              : subtask.notes
                ? <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}><Linkify text={subtask.notes} /></Typography>
                : <Typography variant="body2" color="text.secondary">
                    {readOnly ? 'No description' : 'Add more detail…'}
                  </Typography>}
          </Box>
        )}
        <Divider sx={{ my: 1.5 }} />

        {/* Attachments — ~8% of imported subtasks carry one, almost always a pasted
            performance screenshot. Same component as the card drawer. */}
        <Attachments
          attachments={subtask.attachments}
          readOnly={readOnly}
          onAdd={async (att) => onReplace?.(await addSubtaskAttachment(subtask._id, att))}
          onRemove={async (url) => onReplace?.(await removeSubtaskAttachment(subtask._id, url))}
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Same thread component as a card — 40% of Rachel's subtasks carry comments in
            Asana, and they're optimization notes, not chatter. */}
        <CardComments
          comments={comments}
          onChange={setComments}
          onCreate={payload => createSubtaskComment(subtask._id, payload)}
        />
      </DialogContent>
    </Dialog>
  );
}
