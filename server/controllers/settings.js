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

// ---- per-board setting ------------------------------------------------------
//
// Lumina field visibility is per board ONLY — no global fallback. `boards.luminaFields`
// absent/null means "show everything" (the only default; there is nothing else to fall
// back to). Kept on the board doc rather than its own collection so the board delete
// cascade takes it with the board automatically — there is no new per-board collection
// to wire in.

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
  const [board, cat] = await Promise.all([
    db.collection('boards').findOne({ _id: boardId }, { projection: { luminaFields: 1 } }),
    catalog(),
  ]);
  if (!board) {
    return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  }

  const selection = usableSelection(board.luminaFields) || SHOW_EVERYTHING;
  res.json({ catalog: cat, ...selection });
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
  res.json({ catalog: await catalog(), ...selection });
}

// Back to showing everything Lumina returns — the only default, since there's no
// global setting to fall back to.
async function resetBoardLuminaFields(req, res) {
  const boardId = boardObjectId(req, res);
  if (!boardId) return;
  const db = await getDb();
  const { matchedCount } = await db.collection('boards')
    .updateOne({ _id: boardId }, { $unset: { luminaFields: '' } });
  if (!matchedCount) {
    return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  }
  res.json({ catalog: await catalog(), ...SHOW_EVERYTHING });
}

module.exports = {
  getBoardLuminaFields, updateBoardLuminaFields, resetBoardLuminaFields,
};
