import api from './client';

export const reorderColumns = (boardId, columnIds) =>
  api.put(`/boards/${boardId}/columns/reorder`, { columnIds });

export const updateColumn = (id, data) => api.put(`/columns/${id}`, data).then(r => r.data);
