'use strict';

const { getDb } = require('../db');
const { FIELD_CATALOG } = require('../lib/lumina');

// App-wide settings live as single named docs in `app_settings` (string _id).
// Not per-board, so nothing here is touched by the board delete cascade.
const LUMINA_ID = 'luminaFields';

// Which Lumina fields the card panel shows. Semantics:
//   no doc saved        → show EVERYTHING (the phase-1 default)
//   saved arrays        → show exactly those keys, in catalog order
//   saved empty array   → deliberately hide that whole group
async function getLuminaFields(req, res) {
  const db = await getDb();
  const doc = await db.collection('app_settings').findOne({ _id: LUMINA_ID });
  res.json({
    catalog: FIELD_CATALOG,
    // null (not []) means "unset → show all" — the client must not confuse the two.
    advertiserFields: doc ? doc.advertiserFields : null,
    lineItemFields: doc ? doc.lineItemFields : null,
    updatedAt: doc?.updatedAt || null,
  });
}

// Keep only keys we know about, in catalog order, so a stale client can't inject
// junk and the display order stays stable regardless of click order.
function clean(incoming, allowed) {
  if (!Array.isArray(incoming)) return null;
  const set = new Set(incoming.map(String));
  return allowed.filter(k => set.has(k));
}

async function updateLuminaFields(req, res) {
  const db = await getDb();
  const advertiserFields = clean(req.body.advertiserFields, FIELD_CATALOG.advertiser);
  const lineItemFields = clean(req.body.lineItemFields, FIELD_CATALOG.lineItem);
  if (!advertiserFields || !lineItemFields) {
    return res.status(400).json({
      error: {
        message: 'advertiserFields and lineItemFields arrays are required',
        code: 'VALIDATION',
      },
    });
  }

  await db.collection('app_settings').updateOne(
    { _id: LUMINA_ID },
    { $set: { advertiserFields, lineItemFields, updatedAt: new Date(), updatedBy: req.user?._id || null } },
    { upsert: true }
  );
  res.json({ catalog: FIELD_CATALOG, advertiserFields, lineItemFields });
}

// Back to "show everything" — deletes the doc rather than saving the full list, so
// fields Lumina adds later are picked up automatically.
async function resetLuminaFields(req, res) {
  const db = await getDb();
  await db.collection('app_settings').deleteOne({ _id: LUMINA_ID });
  res.json({ catalog: FIELD_CATALOG, advertiserFields: null, lineItemFields: null });
}

module.exports = { getLuminaFields, updateLuminaFields, resetLuminaFields };
