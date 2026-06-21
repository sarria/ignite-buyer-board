'use strict';

// Local-dev entry point: connect to Mongo, then start a long-lived server.
// On Vercel the app is served via api/index.js as a serverless function instead.
const app = require('./app');
const { connectDb } = require('./db');

const PORT = process.env.PORT || 3001;

connectDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('Failed to start:', err); process.exit(1); });
