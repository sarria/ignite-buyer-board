// Deterministic, Asana-like color per tag name, so a tag looks the same everywhere
// (card preview dots, drawer chips). Pastel background + readable dark text.
const TAG_PALETTE = [
  { bg: '#cde8b0', text: '#3d6b1e', dot: '#7bb33a' }, // green
  { bg: '#bcdcf7', text: '#1c5a99', dot: '#3a8cdb' }, // blue
  { bg: '#ddc9f7', text: '#5b2e9e', dot: '#9a62e3' }, // purple
  { bg: '#f7c6da', text: '#9e2e58', dot: '#e3629a' }, // pink
  { bg: '#fbdcb0', text: '#8a5316', dot: '#e8a33d' }, // orange
  { bg: '#f5e9a8', text: '#85691a', dot: '#e8c63d' }, // yellow
  { bg: '#b9e6e2', text: '#1c6f69', dot: '#3aaaa0' }, // teal
  { bg: '#f3c2c2', text: '#9e2e2e', dot: '#e35a5a' }, // red
  { bg: '#cdd4ee', text: '#3a4674', dot: '#6273c0' }, // indigo
];

export function tagColor(name = '') {
  // Normalize so casing/whitespace variants ("SEM", "sem", " SEM ") map to one color.
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}
