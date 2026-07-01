import api from './client';

export const reorderFields = (boardId, fieldIds) =>
  api.put(`/boards/${boardId}/fields/reorder`, { fieldIds });

export const updateField = (id, data) => api.put(`/fields/${id}`, data).then(r => r.data);
