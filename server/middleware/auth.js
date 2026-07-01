'use strict';

// Auth bypass: attaches a hardcoded dev user so all routes work without MSAL.
// Replace this entire file with real MSAL token verification when auth is enabled.
const DEV_USER = {
  _id: '000000000000000000000001',
  name: 'Dev User',
  email: 'dev@ignite.local',
  role: 'admin',
};

// ─── TEMPORARY shared-password gate ─────────────────────────────────────────
// Stop-gap so we can demo with real (sensitive) imported data before real auth
// exists. When ACCESS_PASSWORD is set, every /api request must send a matching
// `x-access-password` header (or `Authorization: Bearer <pw>`); otherwise 401.
// If ACCESS_PASSWORD is unset (e.g. local dev), the gate is disabled and the app
// behaves as before. Everyone still shares the hardcoded DEV_USER identity.
// TODO(auth): REMOVE this gate when Stephen Alba implements MSAL SSO — replace
// this whole file with real token verification (see "Planned" in CLAUDE.md).
function requireAuth(req, res, next) {
  const required = process.env.ACCESS_PASSWORD;
  if (required) {
    const header = req.get('authorization') || '';
    const provided = req.get('x-access-password')
      || (header.startsWith('Bearer ') ? header.slice(7) : null);
    if (provided !== required) {
      return res.status(401).json({ error: { message: 'Invalid or missing access password', code: 'UNAUTHORIZED' } });
    }
  }
  req.user = DEV_USER;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Admin access required', code: 'FORBIDDEN' } });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
