'use strict';

// Vercel serverless entry — serves the Express app for all /api/* requests.
// vercel.json rewrites /api/(.*) → /api so this handles every API route.
module.exports = require('../server/app');
