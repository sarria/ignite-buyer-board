import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Avatar, Divider, Chip, IconButton, Tooltip, Checkbox, FormControlLabel } from '@mui/material';
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
// `luminaLinked` is only passed for a card's own thread (never a subtask's — subtasks
// carry no Lumina link) and reveals the "push to Lumina" checkbox on the composer.
export default function CardComments({ cardId, comments, onChange, onCreate, heading = 'Comments', luminaLinked = false }) {
  const [editorKey, setEditorKey] = useState(0); // bump to reset the composer
  const [editingId, setEditingId] = useState(null);
  // Defaults ON: a linked card's comments are usually meant for Lumina too, and the buyer
  // opts out per-comment rather than remembering to opt in every time.
  const [pushToLumina, setPushToLumina] = useState(true);
  const bottomRef = useRef(null);
  const scrollPending = useRef(false);

  // Fires after the new comment has actually rendered (not a guessed delay), so the
  // thread's now-taller layout is what gets scrolled, not the one from before it landed.
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [comments]);

  const handleAdd = async (html) => {
    const payload = { body: stripHtml(html), bodyHtml: html };
    if (luminaLinked && pushToLumina) payload.pushToLumina = true;
    const created = onCreate ? await onCreate(payload) : await createComment(cardId, payload);
    scrollPending.current = true;
    onChange([...comments, created]);
    setEditorKey(k => k + 1); // reset composer
    setPushToLumina(true); // back to the default for the next comment
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

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        {comments.map(comment => (
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
                  {comment.pushedToLumina === true && (
                    <Tooltip title="This comment was posted to the line item's Lumina comment thread">
                      <Chip label="Synced to Lumina" size="small" color="primary" variant="outlined" sx={{ height: 16, fontSize: 10 }} />
                    </Tooltip>
                  )}
                  {comment.pushedToLumina === false && comment.luminaPushErrorCode === 'LUMINA_COMMENTS_NOT_FOUND' && (
                    <Tooltip title="This line item isn't reachable through Lumina's Comments API right now (unrelated to this app) — the comment was saved here, just not pushed">
                      <Chip label="Not synced to Lumina" size="small" color="default" variant="outlined" sx={{ height: 16, fontSize: 10, opacity: 0.75 }} />
                    </Tooltip>
                  )}
                  {comment.pushedToLumina === false && comment.luminaPushErrorCode !== 'LUMINA_COMMENTS_NOT_FOUND' && (
                    <Tooltip title={comment.luminaPushError || 'Could not push this comment to Lumina'}>
                      <Chip label="Lumina push failed" size="small" color="error" variant="outlined" sx={{ height: 16, fontSize: 10 }} />
                    </Tooltip>
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

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: userColor(ME), flexShrink: 0 }}>Me</Avatar>
        <Box sx={{ flex: 1 }}>
          <RichTextField
            key={editorKey}
            initialValue=""
            onSave={handleAdd}
            saveLabel="Save comment"
            minHeight={70}
            leadingControl={luminaLinked && (
              <FormControlLabel
                sx={{ ml: 0, mr: 0.5 }}
                control={(
                  <Checkbox
                    size="small"
                    checked={pushToLumina}
                    onChange={(e) => setPushToLumina(e.target.checked)}
                    sx={{ p: 0.5 }}
                  />
                )}
                label={<Typography variant="caption" color="text.secondary">Push to Lumina</Typography>}
              />
            )}
          />
        </Box>
      </Box>
      <div ref={bottomRef} />
    </Box>
  );
}
