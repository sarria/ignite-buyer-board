import { useRef, useState } from 'react';
import { Box, Typography, Tooltip, IconButton, CircularProgress } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { uploadFile } from '../../api/uploads';

// The Attachments section — 96px tiles plus a dashed "add" tile — shared by the card
// drawer and SubtaskDialog. It was duplicated, and the copy destructured `uploadFile`'s
// return (it resolves to a URL *string*, not an object), so every subtask upload posted
// `url: undefined`. One component, one upload path, so that can't happen twice.
//
// The caller owns persistence: `onAdd` gets the finished descriptor and does the API call.

export default function Attachments({
  attachments = [], readOnly = false, onAdd, onRemove, title = 'Attachments',
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const files = attachments.filter(a => !a.inline);
  if (!files.length && readOnly) return null;

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      await onAdd?.({ name: file.name, url, isImage: !!file.type?.startsWith('image/') });
    } catch {
      window.alert('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Typography variant="subtitle2" fontWeight={700} mb={1}>
        {title}{files.length ? ` (${files.length})` : ''}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {files.map((att, i) => (
          <Box key={att.url || i} sx={{ position: 'relative', width: 96, height: 96 }}>
            <Tooltip title={att.name || 'attachment'}>
              <Box
                component="a"
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', height: '100%', borderRadius: 1,
                  border: '1px solid', borderColor: 'divider', overflow: 'hidden',
                  textDecoration: 'none', color: 'text.secondary',
                  p: att.isImage ? 0 : 1,
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                {att.isImage ? (
                  <Box component="img" src={att.url} alt={att.name || ''} loading="lazy"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <Box sx={{ textAlign: 'center', overflow: 'hidden', width: '100%' }}>
                    <InsertDriveFileOutlinedIcon sx={{ fontSize: 30 }} />
                    <Typography sx={{ fontSize: 9, lineHeight: 1.2, mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.name}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Tooltip>
            {!readOnly && (
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  onClick={() => onRemove?.(att.url)}
                  sx={{ position: 'absolute', top: 2, right: 2, p: 0.25, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' } }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
        {!readOnly && (
          <Tooltip title="Add file">
            <Box
              onClick={() => inputRef.current?.click()}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 96, height: 96, borderRadius: 1, cursor: 'pointer',
                border: '1px dashed', borderColor: 'divider', color: 'text.secondary',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
              }}
            >
              {uploading ? <CircularProgress size={22} /> : <AddIcon />}
            </Box>
          </Tooltip>
        )}
        <input ref={inputRef} type="file" hidden
          onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      </Box>
    </>
  );
}
