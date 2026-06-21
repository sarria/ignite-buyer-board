import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
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
