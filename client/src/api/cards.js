import api from './client';

export const getCards = (boardId, params = {}) =>
  api.get(`/boards/${boardId}/cards`, { params }).then(r => r.data);

export const getCard = (id) => api.get(`/cards/${id}`).then(r => r.data);
export const createCard = (boardId, data) => api.post(`/boards/${boardId}/cards`, data).then(r => r.data);
export const updateCard = (id, data) => api.put(`/cards/${id}`, data).then(r => r.data);
export const moveCard = (id, data) => api.put(`/cards/${id}/move`, data).then(r => r.data);
export const moveCardBoard = (id, data) => api.put(`/cards/${id}/move-board`, data).then(r => r.data);
export const setCardFields = (id, data) => api.put(`/cards/${id}/fields`, data).then(r => r.data);
export const deleteCard = (id) => api.delete(`/cards/${id}`).then(r => r.data);
export const reorderCards = (boardId, cardIds) => api.put(`/boards/${boardId}/cards/reorder`, { cardIds });
