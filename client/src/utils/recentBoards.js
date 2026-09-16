// Tracks the last few boards a user actually opened, for the dashboard's
// "Recently viewed" section — client-side only (per-browser, like sidebar width).
const KEY = 'recentBoardIds';
const MAX = 6;

export const getRecentBoardIds = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

export const addRecentBoardId = (id) => {
  if (!id) return;
  try {
    const ids = getRecentBoardIds().filter(x => x !== String(id));
    ids.unshift(String(id));
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    /* ignore storage failures */
  }
};
