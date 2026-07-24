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
  .then(() => {
    // Warm the Lumina advertiser-search cache in the background so the first user
    // to type doesn't pay the full paged pull. Best-effort: never blocks or fails
    // startup. (Long-lived server only — serverless has no startup hook.)
    const lumina = require('./lib/lumina');
    if (!lumina.configured()) return;
    Promise.all([lumina.allLineItems(), lumina.allAdvertisers()])
      .then(([li, adv]) => console.log(`Lumina: cached ${li.length} line items, ${adv.length} advertisers`))
      .catch(err => console.warn('Lumina warm-up skipped:', err.message));
  })
  .catch(err => { console.error('Failed to start:', err); process.exit(1); });
