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

// We store what the admin HID, not what they kept.
//
// This matters: Lumina's line item is a document whose field set varies per
// record, and the picker's catalog is only a sample. With an allow-list, any
// field the sample missed (states, zipcodes, creativeInstructions…) could never
// be selected and so vanished from every card. A hide-list inverts that — unknown
// and newly-added fields show by default, which is also what "no doc saved =
// show everything" already meant.
async function getLuminaFields(req, res) {
  const db = await getDb();
  const [doc, cat] = await Promise.all([
    db.collection('app_settings').findOne({ _id: LUMINA_ID }),
    catalog(),
  ]);

  // Lumina renamed every field on 2026-07-27, so a selection saved before then
  // describes fields that no longer exist. Filtering key-by-key would be worse
  // than useless (market/product/subProduct survived the rename, so "all 13 old
  // fields" would silently become "these 3"), so treat it as unset.
  const LUMINA_RENAME_AT = new Date('2026-07-27T00:00:00Z');
  const stale = !doc?.updatedAt || new Date(doc.updatedAt) < LUMINA_RENAME_AT;

  // Docs saved by the old allow-list UI are NOT converted. "hidden = catalog minus
  // kept" looks right but silently hides every field the old catalog didn't offer
  // (creativeInstructions, additionalDetails, …), which is the exact failure the
  // hide-list exists to prevent. An un-migrated doc means "show everything" and the
  // admin re-picks once.
  const usable = doc && !stale && Array.isArray(doc.hiddenLineItemFields);

  res.json({
    catalog: cat,
    hiddenLineItemFields: usable ? doc.hiddenLineItemFields : [],
    hiddenAdvertiserFields: usable ? (doc.hiddenAdvertiserFields || []) : [],
    updatedAt: (usable && doc.updatedAt) || null,
  });
}

async function updateLuminaFields(req, res) {
  const db = await getDb();
  const { hiddenLineItemFields, hiddenAdvertiserFields } = req.body;
  if (!Array.isArray(hiddenLineItemFields) || !Array.isArray(hiddenAdvertiserFields)) {
    return res.status(400).json({
      error: {
        message: 'hiddenLineItemFields and hiddenAdvertiserFields arrays are required',
        code: 'VALIDATION',
      },
    });
  }

  // Store the hidden keys as given — deliberately NOT filtered against the
  // catalog. A field missing from today's sample must stay hidden if an admin
  // hid it; the allow-list version dropped exactly those and made them reappear.
  const clean = list => [...new Set(list.map(String))].sort();

  await db.collection('app_settings').updateOne(
    { _id: LUMINA_ID },
    {
      $set: {
        hiddenLineItemFields: clean(hiddenLineItemFields),
        hiddenAdvertiserFields: clean(hiddenAdvertiserFields),
        updatedAt: new Date(),
        updatedBy: req.user?._id || null,
      },
      // Drop the old allow-list keys so the two shapes can't disagree later.
      $unset: { lineItemFields: '', advertiserFields: '' },
    },
    { upsert: true }
  );
  res.json({
    catalog: await catalog(),
    hiddenLineItemFields: clean(hiddenLineItemFields),
    hiddenAdvertiserFields: clean(hiddenAdvertiserFields),
  });
}

// Back to showing everything Lumina returns.
async function resetLuminaFields(req, res) {
  const db = await getDb();
  await db.collection('app_settings').deleteOne({ _id: LUMINA_ID });
  res.json({ catalog: await catalog(), hiddenLineItemFields: [], hiddenAdvertiserFields: [] });
}

module.exports = { getLuminaFields, updateLuminaFields, resetLuminaFields };
