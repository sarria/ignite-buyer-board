// Deterministic, consistent avatar color per user — keyed on email (most stable)
// or name — so a given person looks the same everywhere (board cards, comments,
// dashboard, sidebar). White initials read fine on all of these.
const USER_COLORS = [
  '#4573d2', // blue
  '#00897b', // teal
  '#5da283', // green
  '#7e57c2', // deep purple
  '#aa62e3', // purple
  '#d35a8c', // pink
  '#e8733d', // orange
  '#3aa9bd', // cyan
  '#5c6bc0', // indigo
  '#8d6e63', // brown
  '#546e7a', // blue-grey
  '#b9883a', // gold
];

// Accepts a string (name/email) or a user-like object { name, email }.
export function userColor(user) {
  const raw = typeof user === 'string' ? user : (user?.email || user?.name || '');
  const key = raw.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}
