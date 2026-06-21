'use strict';

// Auth bypass: attaches a hardcoded dev user so all routes work without MSAL.
// Replace this entire file with real MSAL token verification when auth is enabled.
const DEV_USER = {
  _id: '000000000000000000000001',
  name: 'Dev User',
  email: 'dev@ignite.local',
  role: 'admin',
};

function requireAuth(req, res, next) {
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
