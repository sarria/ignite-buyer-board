'use strict';

const { getDb } = require('../db');
const lumina = require('../lib/lumina');

// Advertiser records are a small fixed shape; only the LINE-ITEM detail document
// varies by product, so that half of the catalog is discovered from Lumina.
const ADVERTISER_CATALOG = [
  'companyName', 'companySlug', 'advertiserId', 'market', 'markets',
  'reportingStatus', 'advertiserGroupSlugs',
];

async function catalog() {
  return { advertiser: ADVERTISER_CATALOG, lineItem: await lumina.fieldCatalog() };
}

// App-wide settings live as single named docs in `app_settings` (string _id).
// Not per-board, so nothing here is touched by the board delete cascade.
const LUMINA_ID = 'luminaFields';

// Which Lumina fields the card panel shows. Semantics:
//   no doc saved        → show EVERYTHING (the phase-1 default)
//   saved arrays        → show exactly those keys, in catalog order
//   saved empty array   → deliberately hide that whole group
async function getLuminaFields(req, res) {
  const db = await getDb();
  const [doc, cat] = await Promise.all([
    db.collection('app_settings').findOne({ _id: LUMINA_ID }),
    catalog(),
  ]);
  // Lumina renamed every field on 2026-07-27, so any selection saved before then
  // describes fields that no longer exist. Filtering it key-by-key is worse than
  // useless: a handful of names (market, product, subProduct) survived the rename,
  // so "all 13 old fields" would silently become "these 3". Treat pre-rename
  // selections as unset — cards show everything until an admin picks again.
  const LUMINA_RENAME_AT = new Date('2026-07-27T00:00:00Z');
  const stale = !doc?.updatedAt || new Date(doc.updatedAt) < LUMINA_RENAME_AT;

  // Also drop any key that has since vanished from the catalog (product-specific
  // fields come and go); an empty result there means "hide the group", as saved.
  const live = (saved, allowed) =>
    (Array.isArray(saved) ? allowed.filter(k => saved.includes(k)) : null);

  res.json({
    catalog: cat,
    // null (not []) means "unset → show all" — the client must not confuse the two.
    advertiserFields: doc && !stale ? live(doc.advertiserFields, cat.advertiser) : null,
    lineItemFields: doc && !stale ? live(doc.lineItemFields, cat.lineItem) : null,
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
  const cat = await catalog();
  const advertiserFields = clean(req.body.advertiserFields, cat.advertiser);
  const lineItemFields = clean(req.body.lineItemFields, cat.lineItem);
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
  res.json({ catalog: cat, advertiserFields, lineItemFields });
}

// Back to "show everything" — deletes the doc rather than saving the full list, so
// fields Lumina adds later are picked up automatically.
async function resetLuminaFields(req, res) {
  const db = await getDb();
  await db.collection('app_settings').deleteOne({ _id: LUMINA_ID });
  res.json({ catalog: await catalog(), advertiserFields: null, lineItemFields: null });
}

module.exports = { getLuminaFields, updateLuminaFields, resetLuminaFields };
