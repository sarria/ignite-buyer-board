import { Link } from '@mui/material';

// Splits plain text into runs, turning URLs and emails into clickable links.
// Asana account notes (Lumina, DCM, GTM, MCC links, emails) live inside description
// and comment text, so we render them clickable instead of as raw strings.
const PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+)/g;

export default function Linkify({ text }) {
  if (!text) return null;
  const parts = String(text).split(PATTERN);

  return parts.map((part, i) => {
    if (!part) return null;
    if (!PATTERN.test(part)) {
      PATTERN.lastIndex = 0;
      return part;
    }
    PATTERN.lastIndex = 0;

    const isEmail = part.includes('@') && !part.startsWith('http') && !part.startsWith('www.');
    const href = isEmail
      ? `mailto:${part}`
      : part.startsWith('http') ? part : `https://${part}`;

    return (
      <Link
        key={i}
        href={href}
        target={isEmail ? undefined : '_blank'}
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        sx={{ wordBreak: 'break-word' }}
      >
        {part}
      </Link>
    );
  });
}
