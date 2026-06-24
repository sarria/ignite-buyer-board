import { useState } from 'react';
import { Box, Typography, Button, Avatar, Divider, Chip } from '@mui/material';
import { createComment } from '../../api/comments';
import Linkify from '../../utils/linkify';
import RichContent from '../common/RichContent';
import RichEditor from '../common/RichEditor';
import Collapsible from '../common/Collapsible';
import { userColor } from '../../utils/userColor';

// Stub identity for the current user until real auth exists.
const ME = 'Dev User';

// Empty unless there's text or an image (image-only comments are allowed).
const hasContent = (html) =>
  !!html && (/<img/i.test(html) || html.replace(/<[^>]*>/g, '').trim().length > 0);

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function formatDate(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function CardComments({ cardId, comments, onChange }) {
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [editorKey, setEditorKey] = useState(0); // bump to reset the editor

  const handleSubmit = async () => {
    if (!hasContent(html)) return;
    setSaving(true);
    try {
      const text = html.replace(/<[^>]*>/g, '').trim();
      const created = await createComment(cardId, { body: text, bodyHtml: html });
      onChange([...comments, created]);
      setHtml('');
      setEditorKey(k => k + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
        Comments {comments.length > 0 && `(${comments.length})`}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
        <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: userColor(ME), flexShrink: 0 }}>Me</Avatar>
        <Box sx={{ flex: 1 }}>
          <RichEditor key={editorKey} value="" onChange={setHtml} minHeight={70} />
          {hasContent(html) && (
            <Button
              size="small"
              variant="contained"
              sx={{ mt: 0.75 }}
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save comment'}
            </Button>
          )}
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
                    {formatDate(comment.createdAt)}
                  </Typography>
                  {comment.isMigrated && (
                    <Chip label="Imported from Asana" size="small" sx={{ height: 16, fontSize: 10, opacity: 0.7 }} />
                  )}
                </Box>
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
              </Box>
            </Box>
            <Divider sx={{ mt: 2 }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
