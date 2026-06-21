import api from './client';

export const getComments = (cardId) => api.get(`/cards/${cardId}/comments`).then(r => r.data);
export const createComment = (cardId, body) => api.post(`/cards/${cardId}/comments`, { body }).then(r => r.data);
export const updateComment = (id, body) => api.put(`/comments/${id}`, { body }).then(r => r.data);
export const deleteComment = (id) => api.delete(`/comments/${id}`);
