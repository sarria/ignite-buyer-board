import api from './client';

export const createSubtask = (cardId, data) => api.post(`/cards/${cardId}/subtasks`, data).then(r => r.data);
export const updateSubtask = (id, data) => api.put(`/subtasks/${id}`, data).then(r => r.data);
export const deleteSubtask = (id) => api.delete(`/subtasks/${id}`);

export const addSubtaskAttachment = (id, data) =>
  api.post(`/subtasks/${id}/attachments`, data).then(r => r.data);
// Removing also deletes the object from S3 (see the controller).
export const removeSubtaskAttachment = (id, url) =>
  api.delete(`/subtasks/${id}/attachments`, { data: { url } }).then(r => r.data);
