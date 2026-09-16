import api from './client';

export const getBoards = () => api.get('/boards').then(r => r.data);
export const getBoard = (id) => api.get(`/boards/${id}`).then(r => r.data);
export const createBoard = (data) => api.post('/boards', data).then(r => r.data);
export const updateBoard = (id, data) => api.put(`/boards/${id}`, data).then(r => r.data);
export const deleteBoard = (id) => api.delete(`/boards/${id}`);

export const getSavedFilters = (boardId) => api.get(`/boards/${boardId}/saved-filters`).then(r => r.data);
export const createSavedFilter = (boardId, data) => api.post(`/boards/${boardId}/saved-filters`, data).then(r => r.data);
export const deleteSavedFilter = (id) => api.delete(`/saved-filters/${id}`);
