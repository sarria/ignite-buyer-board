'use strict';

// Local-dev entry point: connect to Mongo, then start a long-lived server.
// On Vercel the app is served via api/index.js as a serverless function instead.
const app = require('./app');
const { connectDb } = require('./db');

// Optional DNS override for flaky local resolvers (e.g. a stale VPN DNS that
// refuses SRV lookups). Set DNS_SERVERS=1.1.1.1,8.8.8.8 in .env. No-op in prod.
if (process.env.DNS_SERVERS) {
  require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean));
}

const PORT = process.env.PORT || 3001;

connectDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('Failed to start:', err); process.exit(1); });
