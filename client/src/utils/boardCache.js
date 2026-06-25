// In-memory cache of loaded board data, keyed by board id, that SURVIVES route
// changes (the BoardPage component unmounts when you visit /dashboard, /admin/users,
// etc.; without this its state would be thrown away and refetched on return).
//
// Used SWR-style: BoardPage hydrates instantly from the cache (no skeleton) and
// revalidates in the background. The cache is kept current because every board
// mutation already flows through BoardPage's setState, which writes a snapshot here.
//
// Lifetime = the browser tab (cleared on full reload). No expiry — this is an
// internal tool; the background revalidate keeps an open tab fresh.

const boards = new Map(); // boardId -> { board, columns, cards, templates, archivedLoaded }
let users = null; // global (not per board)

export const getBoardSnapshot = (id) => boards.get(id);
export const setBoardSnapshot = (id, snapshot) => { boards.set(id, snapshot); };
export const clearBoardSnapshot = (id) => { boards.delete(id); };

export const getUsersCache = () => users;
export const setUsersCache = (list) => { users = list; };
