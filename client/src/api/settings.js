import api from './client';

// Which Lumina fields are HIDDEN for a board (see server/controllers/settings.js for
// why it's a hide-list). Read on every card open, so cache it per board id (same idea
// as boardCache). Saving/resetting refreshes the cache in place, so an admin sees the
// change immediately without a reload.
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

// Back to showing everything (the only default — there's no global setting anymore).
export const resetBoardLuminaFieldSettings = (boardId) =>
  api.delete(`/boards/${boardId}/lumina-fields`)
    .then(r => { boardCache.set(boardId, Promise.resolve(r.data)); return r.data; });
