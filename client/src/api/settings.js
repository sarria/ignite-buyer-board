import api from './client';

// Which Lumina fields are HIDDEN (see server/controllers/settings.js for why it's
// a hide-list). Read on every card open, so cache it for the tab (same idea as
// boardCache). Saving/resetting refreshes the cache in place, so an admin sees the
// change immediately without a reload.
let cached = null;

export const getLuminaFieldSettings = () => {
  if (!cached) {
    cached = api.get('/settings/lumina-fields')
      .then(r => r.data)
      .catch(err => { cached = null; throw err; }); // don't cache a failure
  }
  return cached;
};

export const saveLuminaFieldSettings = (hiddenAdvertiserFields, hiddenLineItemFields) =>
  api.put('/settings/lumina-fields', { hiddenAdvertiserFields, hiddenLineItemFields })
    .then(r => { cached = Promise.resolve(r.data); return r.data; });

export const resetLuminaFieldSettings = () =>
  api.delete('/settings/lumina-fields')
    .then(r => { cached = Promise.resolve(r.data); return r.data; });

// ---- per-board override ----------------------------------------------------
// The card panel reads the BOARD-scoped setting, which the server resolves to the
// board's own selection or the global one (`inherited` says which). Cached per
// board id for the same reason the global one is: it's read on every card open.
const boardCache = new Map();

export const getBoardLuminaFieldSettings = (boardId) => {
  if (!boardCache.has(boardId)) {
    boardCache.set(boardId, api.get(`/boards/${boardId}/lumina-fields`)
      .then(r => r.data)
      .catch(err => { boardCache.delete(boardId); throw err; })); // don't cache a failure
  }
  return boardCache.get(boardId);
};

export const saveBoardLuminaFieldSettings = (boardId, hiddenAdvertiserFields, hiddenLineItemFields) =>
  api.put(`/boards/${boardId}/lumina-fields`, { hiddenAdvertiserFields, hiddenLineItemFields })
    .then(r => { boardCache.set(boardId, Promise.resolve(r.data)); return r.data; });

// Back to inheriting the global setting (NOT "show everything").
export const resetBoardLuminaFieldSettings = (boardId) =>
  api.delete(`/boards/${boardId}/lumina-fields`)
    .then(r => { boardCache.set(boardId, Promise.resolve(r.data)); return r.data; });
