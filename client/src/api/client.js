import axios from 'axios';

const api = axios.create({
  // Relative '/api' works in production (same origin on Vercel) and in dev
  // (Vite proxies /api → http://localhost:3001 per vite.config.js).
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// The JWT our server mints after Microsoft SSO. There is no server-side session
// (Vercel functions / k8s pods share no store) — this token IS the session.
export const AUTH_TOKEN_KEY = 'buyerBoard.token';

export const getToken = () => localStorage.getItem(AUTH_TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(AUTH_TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(AUTH_TOKEN_KEY);

// Signing out only forgets OUR session — it deliberately does not end the
// Microsoft SSO session, so "Sign in with Microsoft" re-authenticates without a
// password prompt (standard SSO logout, same as Aura Studio). The hard navigate
// is on purpose: nothing (board cache, open card, cached settings) may survive
// for whoever uses the machine next.
export function signOut() {
  clearToken();
  window.location.assign('/login');
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    // Expired/invalid session: drop the token and let the React layer route to
    // /login. A hard redirect from here would fight the router and can loop on
    // the very request that checks whether we're signed in.
    if (err.response?.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    if (err.response?.status >= 500) {
      console.error('Server error:', err.response.data);
    }
    return Promise.reject(err);
  }
);

export default api;
