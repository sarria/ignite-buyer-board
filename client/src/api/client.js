import axios from 'axios';

const api = axios.create({
  // Relative '/api' works in production (same origin on Vercel) and in dev
  // (Vite proxies /api → http://localhost:3001 per vite.config.js).
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status >= 500) {
      console.error('Server error:', err.response.data);
    }
    return Promise.reject(err);
  }
);

export default api;
