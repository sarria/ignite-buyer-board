'use strict';

const { getDb } = require('../db');
const { signToken } = require('../lib/appToken');
const { SCOPES, isMsalConfigured, getMsalClient, getRedirectUri, getClientUrl } = require('../lib/msal');

function listEnv(name) {
  return (process.env[name] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isDomainAllowed(email) {
  const allowed = listEnv('ALLOWED_EMAIL_DOMAINS');
  if (!allowed.length) return true;
  return allowed.includes(email.split('@')[1] || '');
}

// Buyers already exist in `users` — the Asana import created them from card and
// subtask assignees. Matching on email (case-insensitively, since Entra returns
// the UPN in whatever case it was typed) links a sign-in to that existing record
// so every card assignment survives SSO instead of spawning a duplicate user.
async function upsertUser(email, name, microsoftId) {
  const db = await getDb();
  const users = db.collection('users');
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await users.findOne({ email: { $regex: `^${escaped}$`, $options: 'i' } });

  const isAdmin = listEnv('ADMIN_EMAILS').includes(email.toLowerCase());
  const $set = { name, lastLoginAt: new Date() };
  // Only when present: the index is unique+sparse, and sparse skips MISSING keys,
  // not null ones — writing null for two users would collide on E11000.
  if (microsoftId) $set.microsoftId = microsoftId;
  if (isAdmin) $set.role = 'admin';

  if (existing) {
    return users.findOneAndUpdate({ _id: existing._id }, { $set }, { returnDocument: 'after' });
  }
  return users.findOneAndUpdate(
    { email },
    { $set, $setOnInsert: { email, role: isAdmin ? 'admin' : 'member', createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
}

// GET /api/auth/login — hand the SPA the Microsoft sign-in URL to navigate to.
async function login(req, res) {
  if (!isMsalConfigured()) {
    return res.status(503).json({ error: { message: 'SSO is not configured on this server', code: 'SSO_NOT_CONFIGURED' } });
  }
  const url = await getMsalClient().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: getRedirectUri(req),
  });
  res.json({ url });
}

// GET /api/auth/callback — Entra redirects the BROWSER here with ?code=, so every
// exit from this handler is a redirect back into the SPA, never JSON.
async function callback(req, res) {
  const clientUrl = getClientUrl(req);
  const fail = (message) => res.redirect(`${clientUrl}/login?error=${encodeURIComponent(message)}`);

  const { code, error, error_description: errorDescription } = req.query;
  if (error) return fail(errorDescription || error);
  if (!code) return fail('No authorization code was returned.');

  let result;
  try {
    result = await getMsalClient().acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: getRedirectUri(req),
    });
  } catch (err) {
    console.error('[auth] token exchange failed:', err.message);
    return fail('Sign-in failed. Please try again.');
  }

  const email = result.account?.username || '';
  if (!email) return fail('Microsoft did not return an email address.');
  if (!isDomainAllowed(email)) return fail('Your email domain is not authorized for this app.');

  let user;
  try {
    user = await upsertUser(email, result.account?.name || email, result.account?.homeAccountId);
  } catch (err) {
    console.error('[auth] user upsert failed:', err.message);
    return fail('Sign-in succeeded but your account could not be loaded.');
  }
  // Deactivating a user in Admin > Users has to actually keep them out, or the
  // only effect of "delete" is that they disappear from a dropdown.
  if (user.deactivated) return fail('Your access to the Buyer Board has been deactivated.');

  res.redirect(`${clientUrl}/login/callback?token=${encodeURIComponent(signToken(user))}`);
}

// GET /api/auth/me — behind requireAuth, so reaching it means the token is valid.
async function me(req, res) {
  res.json({ user: req.user, ssoEnabled: isMsalConfigured() });
}

// GET /api/auth/config — public: lets the login screen explain itself when SSO
// isn't wired up yet instead of bouncing the user off a dead button.
async function config(req, res) {
  res.json({ ssoEnabled: isMsalConfigured() });
}

module.exports = { login, callback, me, config };
