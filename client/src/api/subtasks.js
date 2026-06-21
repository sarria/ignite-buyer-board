import api from './client';

export const createSubtask = (cardId, data) => api.post(`/cards/${cardId}/subtasks`, data).then(r => r.data);
export const updateSubtask = (id, data) => api.put(`/subtasks/${id}`, data).then(r => r.data);
export const deleteSubtask = (id) => api.delete(`/subtasks/${id}`);
