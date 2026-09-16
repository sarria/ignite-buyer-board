'use strict';

const { getDb } = require('../db');
const { ObjectId } = require('mongodb');

// Saved filter presets — a buyer's own reusable views on a board (e.g. "My overdue
// SEM accounts"), separate from the auto-remembered LAST filters (see users.js
// boardPrefs). Per-user, not shared with the rest of the board's buyers: nothing
// here designates whose preset it is beyond ownership, and sharing them would need
// a UI for that which nobody's asked for yet.

async function listSavedFilters(req, res, next) {
  try {
    const db = await getDb();
    const boardId = new ObjectId(req.params.id);
    const filters = await db.collection('saved_filters')
      .find({ boardId, userId: new ObjectId(req.user._id) })
      .sort({ createdAt: 1 })
      .toArray();
    res.json(filters);
  } catch (err) { next(err); }
}

async function createSavedFilter(req, res, next) {
  try {
    const db = await getDb();
    const boardId = new ObjectId(req.params.id);
    const { name, filters, completedFilter } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: { message: 'name is required' } });

    const doc = {
      boardId,
      userId: new ObjectId(req.user._id),
      name: name.trim(),
      filters: filters || {},
      completedFilter: completedFilter || 'all',
      createdAt: new Date(),
    };
    const result = await db.collection('saved_filters').insertOne(doc);
    res.status(201).json({ ...doc, _id: result.insertedId });
  } catch (err) { next(err); }
}

async function deleteSavedFilter(req, res, next) {
  try {
    const db = await getDb();
    const _id = new ObjectId(req.params.id);
    // Owner-only — no admin override; these are personal views, not board config.
    const result = await db.collection('saved_filters').deleteOne({ _id, userId: new ObjectId(req.user._id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: { message: 'Saved filter not found' } });
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listSavedFilters, createSavedFilter, deleteSavedFilter };
