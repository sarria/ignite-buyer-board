import api from './client';

export const getTemplates = (boardId) => api.get(`/boards/${boardId}/templates`).then(r => r.data);
export const createTemplate = (boardId, data) => api.post(`/boards/${boardId}/templates`, data).then(r => r.data);
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data).then(r => r.data);
export const deleteTemplate = (id) => api.delete(`/templates/${id}`).then(r => r.data);
export const applyTemplate = (id, columnId, title) => api.post(`/templates/${id}/apply`, { columnId, title }).then(r => r.data);
export const reorderTemplates = (boardId, templateIds) => api.put(`/boards/${boardId}/templates/reorder`, { templateIds });
