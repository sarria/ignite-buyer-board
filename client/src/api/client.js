import axios from 'axios';

const api = axios.create({
  // Relative '/api' works in production (same origin on Vercel) and in dev
  // (Vite proxies /api → http://localhost:3001 per vite.config.js).
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// TEMPORARY access gate: send the shared demo password (if the user has entered
// one) on every request. Remove when real SSO lands. See AccessGate + auth.js.
export const ACCESS_PW_KEY = 'accessPassword';
api.interceptors.request.use((config) => {
  const pw = localStorage.getItem(ACCESS_PW_KEY);
  if (pw) config.headers['x-access-password'] = pw;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    // Wrong/expired demo password → drop it so the gate re-locks. (TEMPORARY)
    if (err.response?.status === 401) localStorage.removeItem(ACCESS_PW_KEY);
    if (err.response?.status >= 500) {
      console.error('Server error:', err.response.data);
    }
    return Promise.reject(err);
  }
);

export default api;
