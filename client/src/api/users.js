import api from './client';

export const getUsers = () => api.get('/users').then(r => r.data);
export const createUser = (data) => api.post('/users', data).then(r => r.data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data).then(r => r.data);
export const deleteUser = (id) => api.delete(`/users/${id}`).then(r => r.data);
export const mergeUser = (id, intoUserId) => api.post(`/users/${id}/merge`, { intoUserId }).then(r => r.data);
export const updateMyBoardPrefs = (boardId, prefs) => api.put(`/users/me/board-prefs/${boardId}`, prefs).then(r => r.data);
