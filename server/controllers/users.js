'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

async function listUsers(req, res) {
  const db = await getDb();
  const users = await db.collection('users').find().sort({ name: 1 }).toArray();
  res.json(users);
}

async function createUser(req, res) {
  const db = await getDb();
  // Default admin (2026-09-15, go-live): see the same comment in auth.js upsertUser.
  const { name, email, role = 'admin' } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: { message: 'name and email are required', code: 'VALIDATION' } });
  }
  const doc = { name, email, role, createdAt: new Date() };
  const result = await db.collection('users').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateUser(req, res) {
  const db = await getDb();
  const userId = new ObjectId(req.params.id);
  const { name, role, defaultBoardId, deactivated } = req.body;
  const $set = {};
  if (name !== undefined) $set.name = name;
  if (role !== undefined) $set.role = role;
  if (defaultBoardId !== undefined) $set.defaultBoardId = new ObjectId(defaultBoardId);
  if (deactivated !== undefined) $set.deactivated = !!deactivated;

  const result = await db.collection('users').findOneAndUpdate(
    { _id: userId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function deleteUser(req, res) {
  const db = await getDb();
  const userId = new ObjectId(req.params.id);
  const result = await db.collection('users').findOneAndUpdate(
    { _id: userId },
    { $set: { deactivated: true } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
  res.status(204).end();
}

// PUT /users/me/board-prefs/:boardId { view, sortBy, sortDir, filters, completedFilter }
// Self-service, own record only (no requireAdmin) — this is "remember what I last had
// open on this board," not board configuration. Stored on the user doc (small,
// bounded by boards actually visited) rather than a new collection, and keyed by
// boardId so it follows the buyer across devices/browsers, unlike the equivalent
// localStorage keys BoardPage falls back to before this loads.
async function updateMyBoardPrefs(req, res) {
  const db = await getDb();
  const userId = new ObjectId(req.user._id);
  const boardId = req.params.boardId;
  const { view, sortBy, sortDir, filters, completedFilter } = req.body;
  const prefs = { updatedAt: new Date() };
  if (view !== undefined) prefs.view = view;
  if (sortBy !== undefined) prefs.sortBy = sortBy;
  if (sortDir !== undefined) prefs.sortDir = sortDir;
  if (filters !== undefined) prefs.filters = filters;
  if (completedFilter !== undefined) prefs.completedFilter = completedFilter;

  const $set = {};
  for (const [k, v] of Object.entries(prefs)) $set[`boardPrefs.${boardId}.${k}`] = v;

  const result = await db.collection('users').findOneAndUpdate(
    { _id: userId },
    { $set },
    { returnDocument: 'after' }
  );
  res.json(result);
}

// Every place a user id is stored, so a merge leaves no orphaned reference. Keep
// this in sync with any new user-referencing field (see CLAUDE.md's deletion
// cascade rule — the same "wire it in or it leaks" logic applies here).
const USER_REF_FIELDS = [
  { collection: 'cards', field: 'assigneeId' },
  { collection: 'subtasks', field: 'assigneeId' },
  { collection: 'comments', field: 'authorId' },
  { collection: 'boards', field: 'createdBy' },
  { collection: 'card_templates', field: 'defaultAssigneeId' },
  { collection: 'saved_filters', field: 'userId' },
];

// POST /users/:id/merge { intoUserId } — reassigns every card/subtask/comment/
// board/template pointing at :id to intoUserId, then deletes :id. Exists because
// SSO matches on exact email: a buyer whose Entra UPN doesn't match their old
// Asana-import email gets a second, unlinked user record instead of reattaching
// to their existing one (see CLAUDE.md > Auth). This is the fix, applied once
// per affected buyer rather than patched by hand in Mongo each time.
async function mergeUser(req, res) {
  const db = await getDb();
  const fromId = new ObjectId(req.params.id);
  const { intoUserId } = req.body;
  if (!intoUserId) {
    return res.status(400).json({ error: { message: 'intoUserId is required', code: 'VALIDATION' } });
  }
  const toId = new ObjectId(intoUserId);
  if (fromId.equals(toId)) {
    return res.status(400).json({ error: { message: 'Cannot merge a user into themselves', code: 'VALIDATION' } });
  }

  const users = db.collection('users');
  const [fromUser, toUser] = await Promise.all([
    users.findOne({ _id: fromId }),
    users.findOne({ _id: toId }),
  ]);
  if (!fromUser || !toUser) {
    return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
  }

  const counts = {};
  for (const { collection, field } of USER_REF_FIELDS) {
    const result = await db.collection(collection).updateMany({ [field]: fromId }, { $set: { [field]: toId } });
    counts[collection] = result.modifiedCount;
  }

  await users.deleteOne({ _id: fromId });
  res.json({ merged: fromUser.email, into: toUser.email, reassigned: counts });
}

module.exports = { listUsers, createUser, updateUser, deleteUser, mergeUser, updateMyBoardPrefs };
