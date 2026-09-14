import api from './client';

// Public: the login screen asks whether SSO is actually configured before it
// offers a button that would only 503.
export const getAuthConfig = () => api.get('/auth/config').then(r => r.data);

// Returns the Microsoft sign-in URL to navigate the browser to.
export const getLoginUrl = () => api.get('/auth/login').then(r => r.data.url);

export const getMe = () => api.get('/auth/me').then(r => r.data);
