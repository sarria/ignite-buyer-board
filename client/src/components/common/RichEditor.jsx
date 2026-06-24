import { useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExt from '@tiptap/extension-link';
import ImageExt from '@tiptap/extension-image';
import { Box, IconButton, Tooltip } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import LinkIcon from '@mui/icons-material/Link';
import ImageIcon from '@mui/icons-material/Image';
import { uploadFile } from '../../api/uploads';

// Basic rich text editor (bold, italic, lists, link, image). Images paste/drag/pick
// → uploaded to S3 → inserted inline. Outputs HTML via onChange (same shape we render).
export default function RichEditor({ value = '', onChange, minHeight = 90 }) {
  const fileRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExt.configure({ openOnClick: false, autolink: true }),
      ImageExt,
    ],
    // Asana HTML uses bare "\n" for line breaks (rendered via white-space:pre-wrap).
    // TipTap parses real HTML where newlines are insignificant, so convert them to
    // <br> first or the content collapses into one block.
    content: (value || '').replace(/\n/g, '<br>'),
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      handlePaste: (_v, e) => handleFiles(e.clipboardData?.files),
      handleDrop: (_v, e) => handleFiles(e.dataTransfer?.files),
    },
  });

  async function insertImageFile(file) {
    try {
      const url = await uploadFile(file);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch {
      // eslint-disable-next-line no-alert
      window.alert('Image upload failed.');
    }
  }
  function handleFiles(files) {
    const imgs = [...(files || [])].filter(f => f.type?.startsWith('image/'));
    if (!imgs.length) return false;
    imgs.forEach(insertImageFile);
    return true; // we handled it
  }

  if (!editor) return null;

  const Btn = ({ active, onClick, title, icon: Icon }) => (
    <Tooltip title={title}>
      <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={onClick}
        sx={{ color: active ? 'primary.main' : 'text.secondary' }}>
        <Icon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:focus-within': { borderColor: 'primary.main' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, px: 0.5, py: 0.25, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
        <Btn active={editor.isActive('bold')} title="Bold" icon={FormatBoldIcon} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Btn active={editor.isActive('italic')} title="Italic" icon={FormatItalicIcon} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Btn active={editor.isActive('bulletList')} title="Bulleted list" icon={FormatListBulletedIcon} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Btn active={editor.isActive('orderedList')} title="Numbered list" icon={FormatListNumberedIcon} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Btn active={editor.isActive('link')} title="Link" icon={LinkIcon} onClick={() => {
          const prev = editor.getAttributes('link').href;
          const url = window.prompt('Link URL', prev || 'https://');
          if (url === null) return;
          if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
          else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }} />
        <Btn active={false} title="Image" icon={ImageIcon} onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
      </Box>
      <Box sx={{
        '& .ProseMirror': {
          minHeight, p: 1, outline: 'none', fontSize: 14, lineHeight: 1.5,
          '& p': { m: 0, mb: 0.5 },
          '& ul, & ol': { pl: 3, m: 0, mb: 0.5 },
          '& a': { color: '#2563eb' },
          '& img': { maxWidth: '100%', height: 'auto', borderRadius: 1, border: '1px solid', borderColor: 'divider' },
          '& img.ProseMirror-selectednode': { outline: '2px solid #4573d2' },
        },
      }}>
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}
