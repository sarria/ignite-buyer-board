// Remembers the last board the user successfully viewed, so '/' can return them there.
const KEY = 'lastBoardId';

export const getLastBoardId = () => {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
};

export const setLastBoardId = (id) => {
  try {
    if (id) localStorage.setItem(KEY, String(id));
  } catch {
    /* ignore storage failures */
  }
};

export const clearLastBoardId = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
