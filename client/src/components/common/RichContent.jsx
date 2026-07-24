import { useMemo } from 'react';
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

// Parse-and-set rather than regex: attribute rewriting on an HTML string is easy
// to get subtly wrong, and the input is already sanitized at this point.
function withNewTabLinks(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  for (const a of doc.querySelectorAll('a[href]')) {
    if (a.getAttribute('href').trim().toLowerCase().startsWith('mailto:')) continue;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer'); // never leak window.opener
  }
  return doc.body.innerHTML;
}

export default function RichContent({ html, sx }) {
  // Sanitize once per unique html — expensive (DOMPurify + regex), and otherwise
  // re-runs on every parent re-render (e.g. each keystroke in a sibling field).
  const clean = useMemo(() => {
    if (!html) return '';
    let c = DOMPurify.sanitize(html, CONFIG);
    // Force every link to open in a new tab. Migrated Asana anchors carry no
    // target, and following one in-place would blow away the board (and any
    // unsaved editor state) to visit Lumina/DCM/GTM. mailto: is left alone —
    // opening a blank tab to hand off to a mail client is just litter.
    c = withNewTabLinks(c);
    // Wrap each image so we can show a download/open button on hover.
    c = c.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
      const src = attrs.match(/src="([^"]*)"/)?.[1] || '';
      const dl = src
        ? `<a class="rc-dl" href="${src}" target="_blank" rel="noopener noreferrer" title="Open image">↓</a>`
        : '';
      return `<span class="rc-img"><img ${attrs} loading="lazy"/>${dl}</span>`;
    });
    return c;
  }, [html]);

  if (!html) return null;

  return (
    <Box
      className="rich-content"
      // Don't let a link/image click bubble to a parent's click-to-edit (the
      // description box) — otherwise following a link also opens the editor.
      onClick={e => { if (e.target.closest('a')) e.stopPropagation(); }}
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
