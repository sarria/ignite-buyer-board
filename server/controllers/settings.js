'use strict';

const { ObjectId } = require('mongodb');
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
// Lumina renamed every field on 2026-07-27, so a selection saved before then
// describes fields that no longer exist. Filtering key-by-key would be worse than
// useless (market/product/subProduct survived the rename, so "all 13 old fields"
// would silently become "these 3"), so treat it as unset.
//
// Docs saved by the old allow-list UI are NOT converted either. "hidden = catalog
// minus kept" looks right but silently hides every field the old catalog didn't
// offer (creativeInstructions, additionalDetails, …), which is the exact failure
// the hide-list exists to prevent. Un-migrated means "show everything" and the
// admin re-picks once.
//
// Shared by the global setting and the per-board override so the two can't drift.
const LUMINA_RENAME_AT = new Date('2026-07-27T00:00:00Z');

function usableSelection(doc) {
  if (!doc || !Array.isArray(doc.hiddenLineItemFields)) return null;
  if (!doc.updatedAt || new Date(doc.updatedAt) < LUMINA_RENAME_AT) return null;
  return {
    hiddenLineItemFields: doc.hiddenLineItemFields,
    hiddenAdvertiserFields: doc.hiddenAdvertiserFields || [],
    updatedAt: doc.updatedAt,
  };
}

const SHOW_EVERYTHING = { hiddenLineItemFields: [], hiddenAdvertiserFields: [], updatedAt: null };

// Store the hidden keys as given — deliberately NOT filtered against the catalog.
// A field missing from today's sample must stay hidden if an admin hid it; the
// allow-list version dropped exactly those and made them reappear.
const clean = list => [...new Set(list.map(String))].sort();

function validHidden(body) {
  return Array.isArray(body.hiddenLineItemFields) && Array.isArray(body.hiddenAdvertiserFields);
}

const badRequest = res => res.status(400).json({
  error: {
    message: 'hiddenLineItemFields and hiddenAdvertiserFields arrays are required',
    code: 'VALIDATION',
  },
});

async function getLuminaFields(req, res) {
  const db = await getDb();
  const [doc, cat] = await Promise.all([
    db.collection('app_settings').findOne({ _id: LUMINA_ID }),
    catalog(),
  ]);
  res.json({ catalog: cat, ...(usableSelection(doc) || SHOW_EVERYTHING) });
}

async function updateLuminaFields(req, res) {
  const db = await getDb();
  const { hiddenLineItemFields, hiddenAdvertiserFields } = req.body;
  if (!validHidden(req.body)) return badRequest(res);

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

// ---- per-board override ----------------------------------------------------
//
// A board may override the global selection; `boards.luminaFields` absent/null
// means "inherit the global one". Kept on the board doc rather than its own
// collection so the board delete cascade takes it with the board automatically —
// there is no new per-board collection to wire in.
//
// Resolution is board → global → show everything. `inherited` tells the UI which
// one it's looking at, so a board can show "using the global setting" instead of
// pretending the values are its own.

function boardObjectId(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: { message: 'Invalid board id', code: 'VALIDATION' } });
    return null;
  }
  return new ObjectId(req.params.id);
}

async function getBoardLuminaFields(req, res) {
  const boardId = boardObjectId(req, res);
  if (!boardId) return;
  const db = await getDb();
  const [board, globalDoc, cat] = await Promise.all([
    db.collection('boards').findOne({ _id: boardId }, { projection: { luminaFields: 1 } }),
    db.collection('app_settings').findOne({ _id: LUMINA_ID }),
    catalog(),
  ]);
  if (!board) {
    return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  }

  const own = usableSelection(board.luminaFields);
  const selection = own || usableSelection(globalDoc) || SHOW_EVERYTHING;
  res.json({ catalog: cat, ...selection, inherited: !own });
}

async function updateBoardLuminaFields(req, res) {
  const boardId = boardObjectId(req, res);
  if (!boardId) return;
  if (!validHidden(req.body)) return badRequest(res);
  const db = await getDb();

  const selection = {
    hiddenLineItemFields: clean(req.body.hiddenLineItemFields),
    hiddenAdvertiserFields: clean(req.body.hiddenAdvertiserFields),
    updatedAt: new Date(),
    updatedBy: req.user?._id || null,
  };
  const { matchedCount } = await db.collection('boards')
    .updateOne({ _id: boardId }, { $set: { luminaFields: selection } });
  if (!matchedCount) {
    return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  }
  res.json({ catalog: await catalog(), ...selection, inherited: false });
}

// Drop the override so the board follows the global setting again. This is NOT
// "show everything" — that's what the global one may or may not say.
async function resetBoardLuminaFields(req, res) {
  const boardId = boardObjectId(req, res);
  if (!boardId) return;
  const db = await getDb();
  const { matchedCount } = await db.collection('boards')
    .updateOne({ _id: boardId }, { $unset: { luminaFields: '' } });
  if (!matchedCount) {
    return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  }
  const globalDoc = await db.collection('app_settings').findOne({ _id: LUMINA_ID });
  res.json({
    catalog: await catalog(),
    ...(usableSelection(globalDoc) || SHOW_EVERYTHING),
    inherited: true,
  });
}

module.exports = {
  getLuminaFields, updateLuminaFields, resetLuminaFields,
  getBoardLuminaFields, updateBoardLuminaFields, resetBoardLuminaFields,
};
