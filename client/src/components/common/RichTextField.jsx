import { useState } from 'react';
import { Box, Button } from '@mui/material';
import RichEditor from './RichEditor';

// Empty unless there's text or an image (image-only content is allowed).
export const hasContent = (html) =>
  !!html && (/<img/i.test(html) || html.replace(/<[^>]*>/g, '').trim().length > 0);

// Wraps RichEditor + Save/Cancel and keeps the draft HTML in LOCAL state, so typing
// re-renders only this field — not the parent panel (no per-keystroke flicker). Shows
// a "Saving…" state while onSave runs. onSave receives the current HTML.
export default function RichTextField({
  initialValue = '', onSave, onCancel, saveLabel = 'Save', minHeight = 90, leadingControl,
}) {
  const [html, setHtml] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!hasContent(html) || saving) return;
    setSaving(true);
    try {
      await onSave(html);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <RichEditor value={initialValue} onChange={setHtml} minHeight={minHeight} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
        <Button
          size="small"
          variant="contained"
          disabled={!hasContent(html) || saving}
          onClick={submit}
          sx={{ textTransform: 'none', py: 0.25, px: 1.25, fontSize: 12.5, minWidth: 0 }}
        >
          {saving ? 'Saving…' : saveLabel}
        </Button>
        {onCancel && (
          <Button
            size="small"
            onClick={onCancel}
            disabled={saving}
            sx={{ textTransform: 'none', py: 0.25, px: 1.25, fontSize: 12.5, minWidth: 0, color: 'text.secondary' }}
          >
            Cancel
          </Button>
        )}
        {leadingControl && <Box sx={{ ml: 'auto' }}>{leadingControl}</Box>}
      </Box>
    </Box>
  );
}
