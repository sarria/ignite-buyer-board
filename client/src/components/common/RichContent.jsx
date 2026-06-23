import { Box } from '@mui/material';
import DOMPurify from 'dompurify';

// Render migrated Asana rich text (comment html / description html) safely.
// Inline <img> are kept (already rewritten to S3 URLs at migration time) and get a
// hover "open/download" affordance.
const CONFIG = {
  ALLOWED_TAGS: ['a', 'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span',
    'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'hr'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel', 'data-asana-gid'],
};

export default function RichContent({ html, sx }) {
  if (!html) return null;
  let clean = DOMPurify.sanitize(html, CONFIG);
  // Wrap each image so we can show a download/open button on hover.
  clean = clean.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
    const src = attrs.match(/src="([^"]*)"/)?.[1] || '';
    const dl = src
      ? `<a class="rc-dl" href="${src}" target="_blank" rel="noopener noreferrer" title="Open image">↓</a>`
      : '';
    return `<span class="rc-img"><img ${attrs} loading="lazy"/>${dl}</span>`;
  });

  return (
    <Box
      className="rich-content"
      dangerouslySetInnerHTML={{ __html: clean }}
      sx={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        '& a': { color: '#2563eb' },
        '& img': {
          maxWidth: '100%', height: 'auto', display: 'block', my: 0.5,
          borderRadius: 1, border: '1px solid', borderColor: 'divider',
        },
        '& .rc-img': { position: 'relative', display: 'inline-block', maxWidth: '100%' },
        '& .rc-dl': {
          position: 'absolute', top: 6, right: 6, width: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 1,
          textDecoration: 'none', fontSize: 15, fontWeight: 700,
          opacity: 0, transition: 'opacity 0.15s',
        },
        '& .rc-img:hover .rc-dl': { opacity: 1 },
        ...sx,
      }}
    />
  );
}
