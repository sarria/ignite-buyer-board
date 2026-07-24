'use strict';

const lumina = require('../lib/lumina');

// Also doubles as a cache warm-up ping: the client calls this on board load so the
// advertiser list is already in memory by the time someone opens the attach search.
// Fire-and-forget — we answer immediately and never make the caller wait on Lumina.
// (Matters on Vercel, where there's no startup hook and each cold function instance
// starts empty.)
async function status(req, res) {
  const configured = lumina.configured();
  if (configured && req.query.warm === '1') {
    // Line items power the attach dropdown; advertisers are the parent lookup.
    lumina.allLineItems().catch(() => { /* best-effort; search will retry */ });
    lumina.allAdvertisers().catch(() => {});
  }
  res.json({ configured });
}

async function searchAdvertisers(req, res) {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const items = await lumina.searchAdvertisers(req.query.q, limit);
  res.json({ items });
}

// Live snapshot — the card stores only the id, so this is the read path every
// time a card drawer opens.
async function getAdvertiser(req, res) {
  const snap = await lumina.advertiserSnapshot(req.params.id);
  if (!snap.advertiser && !snap.lineItems.length) {
    return res.status(404).json({
      error: { message: 'Advertiser not found in Lumina', code: 'NOT_FOUND' },
    });
  }
  res.json(snap);
}

async function searchLineItems(req, res) {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const items = await lumina.searchLineItems(req.query.q, limit);
  res.json({ items });
}

// The card read path once it's linked to a line item.
async function getLineItem(req, res) {
  const snap = await lumina.lineItemSnapshot(req.params.id);
  if (!snap.lineItem) {
    return res.status(404).json({
      error: { message: 'Line item not found in Lumina', code: 'NOT_FOUND' },
    });
  }
  res.json(snap);
}

module.exports = { status, searchAdvertisers, getAdvertiser, searchLineItems, getLineItem };
