'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { verifyToken, tokenFromRequest } = require('../lib/appToken');
const { isMsalConfigured } = require('../lib/msal');

// Local-dev identity used ONLY when SSO isn't configured. See requireAuth.
const DEV_USER = {
  _id: '000000000000000000000001',
  name: 'Dev User',
  email: 'dev@ignite.local',
  role: 'admin',
};

function unauthorized(res, message = 'Sign-in required') {
  return res.status(401).json({ error: { message, code: 'UNAUTHORIZED' } });
}

// Microsoft SSO. The SPA sends `Authorization: Bearer <our jwt>`; we verify the
// signature and then re-read the user from Mongo, so role changes and
// deactivation take effect immediately instead of waiting out a 5-day token.
//
// When MSAL is NOT configured the app falls back to the hardcoded DEV_USER so a
// local checkout runs with no Entra setup — but ONLY outside production, because
// this database holds real buyer data and an unset env var must never silently
// open it up.
async function requireAuth(req, res, next) {
  if (!isMsalConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: { message: 'SSO is not configured on this server', code: 'SSO_NOT_CONFIGURED' } });
    }
    req.user = DEV_USER;
    return next();
  }

  const token = tokenFromRequest(req);
  if (!token) return unauthorized(res);

  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    return unauthorized(res, 'Your session has expired. Please sign in again.');
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: new ObjectId(claims.sub) });
  if (!user) return unauthorized(res, 'Your account no longer exists.');
  if (user.deactivated) return res.status(403).json({ error: { message: 'Your access has been deactivated', code: 'FORBIDDEN' } });

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Admin access required', code: 'FORBIDDEN' } });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
