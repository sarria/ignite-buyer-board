'use strict';

// Microsoft Entra ID (Azure AD) confidential client — the server half of SSO.
// The client secret NEVER reaches the browser: the SPA only ever calls our own
// /api/auth/* endpoints, which do the code exchange here.
const { ConfidentialClientApplication } = require('@azure/msal-node');

const SCOPES = (process.env.MSAL_SCOPES || 'user.read')
  .split(',').map(s => s.trim()).filter(Boolean);

function authority() {
  return process.env.MSAL_AUTHORITY
    || `https://login.microsoftonline.com/${process.env.MSAL_TENANT_ID || 'common'}`;
}

function isMsalConfigured() {
  return Boolean(process.env.MSAL_CLIENT_ID && process.env.MSAL_CLIENT_SECRET);
}

// Built lazily so a missing env var can't crash the server (or a cold serverless
// invocation) on startup — it surfaces as a 503 on the login route instead.
let client = null;
function getMsalClient() {
  if (!client) {
    if (!isMsalConfigured()) {
      throw new Error('MSAL_CLIENT_ID and MSAL_CLIENT_SECRET must be set');
    }
    client = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.MSAL_CLIENT_ID,
        clientSecret: process.env.MSAL_CLIENT_SECRET,
        authority: authority(),
      },
    });
  }
  return client;
}

// The browser-visible origin of THIS request. PUBLIC_PROTO pins the scheme when
// TLS terminates upstream (k8s ingress → pod is plain HTTP, so req.secure is
// false and x-forwarded-proto may not survive); unset locally and on Vercel.
function originOf(req) {
  const proto = process.env.PUBLIC_PROTO
    || req.headers['x-forwarded-proto']
    || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Derived from the request host so one build works on localhost, Vercel previews
// and the k8s hostname — each just has to be a registered redirect URI in Entra.
// MSAL_REDIRECT_URI pins it when that derivation can't be trusted.
function getRedirectUri(req) {
  return process.env.MSAL_REDIRECT_URI || `${originOf(req)}/api/auth/callback`;
}

// Where to send the browser after sign-in. Same origin unless the SPA is served
// from a different host than the API (CLIENT_URL).
function getClientUrl(req) {
  return (process.env.CLIENT_URL || originOf(req)).replace(/\/$/, '');
}

module.exports = { SCOPES, isMsalConfigured, getMsalClient, getRedirectUri, getClientUrl };
