import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getMe } from '../api/auth';
import { setToken, signOut as clearSession } from '../api/client';

const AuthContext = createContext(null);

// Identity comes from GET /auth/me, not from decoding the token: role and
// deactivation are re-read server-side on every request, so the server's answer
// is the only one that can't be stale (or edited in localStorage).
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authed | anon
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await getMe();
      setUser(me);
      setStatus('authed');
      return me;
    } catch {
      setUser(null);
      setStatus('anon');
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Raised by the axios interceptor on any 401 — a session that expired mid-use
  // drops the user to the login screen instead of leaving a dead-looking board.
  useEffect(() => {
    const onExpired = () => { setUser(null); setStatus('anon'); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const signIn = useCallback(async (token) => {
    setToken(token);
    return refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut: clearSession, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
