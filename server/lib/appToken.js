'use strict';

// Our own session token. Stateless on purpose: Vercel functions (and k8s pods
// behind a load balancer) have no shared session store, so the signed JWT IS the
// session. It carries identity only — role is re-read from Mongo on every request
// so an admin change takes effect without waiting for the token to expire.
const jwt = require('jsonwebtoken');

const TTL_SECONDS = parseInt(process.env.JWT_TTL_SECONDS || String(60 * 60 * 24 * 5), 10);

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET must be set');
  return value;
}

function signToken(user) {
  return jwt.sign(
    {
      iss: 'ignite-buyer-board',
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      microsoftId: user.microsoftId,
    },
    secret(),
    { expiresIn: TTL_SECONDS }
  );
}

function verifyToken(token) {
  return jwt.verify(token, secret());
}

// Accepts `Authorization: Bearer <jwt>`.
function tokenFromRequest(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

module.exports = { signToken, verifyToken, tokenFromRequest, TTL_SECONDS };
