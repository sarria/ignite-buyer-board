import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getMe } from '../api/auth';
import { setToken, signOut as clearSession } from '../api/client';

const AuthContext = createContext(null);

const PREVIEW_KEY = 'auth.previewAsMember';

// Identity comes from GET /auth/me, not from decoding the token: role and
// deactivation are re-read server-side on every request, so the server's answer
// is the only one that can't be stale (or edited in localStorage).
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authed | anon
  const [user, setUser] = useState(null);
  // Admin-only, client-side-only "Preview as member" toggle: lets an admin see the
  // member-facing UI without touching their real DB role (so they can't lock
  // themselves out). It never changes what the server allows — the server still
  // trusts the real role — it only changes what admin-only affordances we render.
  const [previewAsMember, setPreviewAsMember] = useState(() => {
    try { return localStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; }
  });
  const togglePreviewAsMember = useCallback(() => {
    setPreviewAsMember(prev => {
      const next = !prev;
      try { localStorage.setItem(PREVIEW_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const isRealAdmin = user?.role === 'admin';
  const isAdmin = isRealAdmin && !previewAsMember;
  // The user-merge tool is ours, not a board admin's — gated separately from role,
  // since every new user currently defaults to admin (see server auth.js
  // upsertUser). Also respects previewAsMember so it disappears in that preview.
  const isSuperAdmin = !!user?.isSuperAdmin && !previewAsMember;

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

  // Merges a board's remembered view/sort/filters into the LOCAL user object only —
  // the server call that actually persists it (updateMyBoardPrefs) already returned
  // the saved doc, so this just avoids a second round-trip to reflect it everywhere
  // useAuth() is read (e.g. re-opening the same board without a refetch).
  const setBoardPrefsLocal = useCallback((boardId, prefs) => {
    setUser(prev => (prev ? { ...prev, boardPrefs: { ...prev.boardPrefs, [boardId]: prefs } } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{
      status, user, signIn, signOut: clearSession, refresh, setBoardPrefsLocal,
      isAdmin, isRealAdmin, isSuperAdmin, previewAsMember, togglePreviewAsMember,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
