import api from './client';

export const getComments = (cardId) => api.get(`/cards/${cardId}/comments`).then(r => r.data);
export const createComment = (cardId, payload) =>
  api.post(`/cards/${cardId}/comments`, typeof payload === 'string' ? { body: payload } : payload).then(r => r.data);
// Subtask threads are their own endpoints — a card's thread deliberately excludes them,
// so a subtask's notes never leak into its parent's conversation.
export const getSubtaskComments = (subtaskId) =>
  api.get(`/subtasks/${subtaskId}/comments`).then(r => r.data);
export const createSubtaskComment = (subtaskId, payload) =>
  api.post(`/subtasks/${subtaskId}/comments`, typeof payload === 'string' ? { body: payload } : payload).then(r => r.data);

export const updateComment = (id, payload) =>
  api.put(`/comments/${id}`, typeof payload === 'string' ? { body: payload } : payload).then(r => r.data);
export const deleteComment = (id) => api.delete(`/comments/${id}`);
