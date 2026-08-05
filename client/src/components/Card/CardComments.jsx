import { useState } from 'react';
import { Box, Typography, Avatar, Divider, Chip, IconButton, Tooltip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { createComment, updateComment } from '../../api/comments';
import Linkify from '../../utils/linkify';
import RichContent from '../common/RichContent';
import RichTextField from '../common/RichTextField';
import Collapsible from '../common/Collapsible';
import { userColor } from '../../utils/userColor';

// Stub identity for the current user until real auth exists.
const ME = 'Dev User';

const stripHtml = (html) => html.replace(/<[^>]*>/g, '').trim();

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function formatDate(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// `onCreate` lets the same thread serve a subtask (see SubtaskDialog) — everything else
// about rendering a comment is identical, and forking the component would guarantee the
// two drift.
export default function CardComments({ cardId, comments, onChange, onCreate, heading = 'Comments' }) {
  const [editorKey, setEditorKey] = useState(0); // bump to reset the composer
  const [editingId, setEditingId] = useState(null);

  const handleAdd = async (html) => {
    const payload = { body: stripHtml(html), bodyHtml: html };
    const created = onCreate ? await onCreate(payload) : await createComment(cardId, payload);
    onChange([...comments, created]);
    setEditorKey(k => k + 1); // reset composer
  };

  const handleSaveEdit = async (comment, html) => {
    const updated = await updateComment(comment._id, { body: stripHtml(html), bodyHtml: html });
    onChange(comments.map(c => (c._id === updated._id ? updated : c)));
    setEditingId(null);
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
        {heading} {comments.length > 0 && `(${comments.length})`}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
        <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: userColor(ME), flexShrink: 0 }}>Me</Avatar>
        <Box sx={{ flex: 1 }}>
          <RichTextField key={editorKey} initialValue="" onSave={handleAdd} saveLabel="Save comment" minHeight={70} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[...comments].reverse().map(comment => (
          <Box key={comment._id}>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: comment.isMigrated ? userColor({ name: comment.migratedAuthorName, email: comment.migratedAuthorEmail }) : userColor(ME), flexShrink: 0 }}>
                {comment.isMigrated
                  ? getInitials(comment.migratedAuthorName || '?')
                  : 'Me'}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                  <Typography variant="caption" fontWeight={700}>
                    {comment.isMigrated ? comment.migratedAuthorName : 'You'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(comment.createdAt)}{comment.editedAt ? ' · edited' : ''}
                  </Typography>
                  {comment.isMigrated && (
                    <Chip label="Imported from Asana" size="small" sx={{ height: 16, fontSize: 10, opacity: 0.7 }} />
                  )}
                  {!comment.isMigrated && editingId !== comment._id && (
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setEditingId(comment._id)} sx={{ ml: 'auto', color: 'text.secondary' }}>
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
                {editingId === comment._id ? (
                  <RichTextField
                    key={`edit-${comment._id}`}
                    initialValue={comment.bodyHtml || comment.body || ''}
                    onSave={(html) => handleSaveEdit(comment, html)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <Collapsible collapsedHeight={260}>
                    {comment.bodyHtml ? (
                      <RichContent html={comment.bodyHtml} sx={{ fontSize: 14, color: comment.isMigrated ? 'text.secondary' : 'text.primary' }} />
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{ whiteSpace: 'pre-wrap', color: comment.isMigrated ? 'text.secondary' : 'text.primary' }}
                      >
                        <Linkify text={comment.body} />
                      </Typography>
                    )}
                  </Collapsible>
                )}
              </Box>
            </Box>
            <Divider sx={{ mt: 2 }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
