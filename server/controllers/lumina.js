'use strict';

const lumina = require('../lib/lumina');

// `warm=1` used to pre-load a full-cohort cache. Lumina now searches server-side,
// so there is nothing to warm — kept as a no-op so the client ping stays harmless.
async function status(req, res) {
  res.json({ configured: lumina.configured() });
}

async function searchLineItems(req, res) {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const items = await lumina.searchLineItems(req.query.q, limit);
  res.json({ items });
}

async function getLineItem(req, res) {
  const snap = await lumina.lineItemSnapshot(req.params.id);
  if (!snap) {
    return res.status(404).json({
      error: { message: 'Line item not found in Lumina', code: 'NOT_FOUND' },
    });
  }
  res.json(snap);
}

async function searchAdvertisers(req, res) {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const items = await lumina.searchAdvertisers(req.query.q, limit);
  res.json({ items });
}

// Legacy read path for cards linked to an advertiser rather than a line item.
async function getAdvertiser(req, res) {
  const snap = await lumina.advertiserSnapshot(req.params.id);
  if (!snap) {
    return res.status(404).json({
      error: { message: 'Advertiser not found in Lumina', code: 'NOT_FOUND' },
    });
  }
  res.json(snap);
}

module.exports = { status, searchLineItems, getLineItem, searchAdvertisers, getAdvertiser };
