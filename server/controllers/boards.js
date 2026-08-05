'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { s3UrlsInHtml, deleteUrls } = require('../lib/s3');

// Columns a brand-new board starts with (Asana-like blank board). Editable in Settings.
const DEFAULT_COLUMNS = ['To Do', 'Doing', 'Done'];

async function listBoards(req, res) {
  const db = await getDb();
  const boards = await db.collection('boards').find().sort({ name: 1 }).toArray();
  const [columnCounts, cardCounts] = await Promise.all([
    db.collection('columns').aggregate([{ $group: { _id: '$boardId', count: { $sum: 1 } } }]).toArray(),
    db.collection('cards').aggregate([{ $group: { _id: '$boardId', count: { $sum: 1 } } }]).toArray(),
  ]);
  const colMap = Object.fromEntries(columnCounts.map(r => [r._id.toString(), r.count]));
  const cardMap = Object.fromEntries(cardCounts.map(r => [r._id.toString(), r.count]));
  res.json(boards.map(b => ({
    ...b,
    columnCount: colMap[b._id.toString()] || 0,
    cardCount: cardMap[b._id.toString()] || 0,
  })));
}

async function getBoard(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const board = await db.collection('boards').findOne({ _id: boardId });
  if (!board) return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });

  const [columns, fields] = await Promise.all([
    db.collection('columns').find({ boardId }).sort({ position: 1 }).toArray(),
    db.collection('custom_fields').find({ boardId }).sort({ position: 1 }).toArray(),
  ]);
  res.json({ ...board, columns, fields });
}

async function createBoard(req, res) {
  const db = await getDb();
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION' } });

  const doc = { name, description, createdBy: new ObjectId(req.user._id), createdAt: new Date(), isArchived: false };
  const result = await db.collection('boards').insertOne(doc);
  const boardId = result.insertedId;
  // Seed default columns so the board is immediately usable (Asana-like).
  const now = new Date();
  await db.collection('columns').insertMany(
    DEFAULT_COLUMNS.map((name, position) => ({ boardId, name, position, color: null, createdAt: now }))
  );
  res.status(201).json({ ...doc, _id: boardId });
}

async function updateBoard(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const { name, description, isArchived } = req.body;
  const $set = {};
  if (name !== undefined) $set.name = name;
  if (description !== undefined) $set.description = description;
  if (isArchived !== undefined) $set.isArchived = !!isArchived;

  const result = await db.collection('boards').findOneAndUpdate(
    { _id: boardId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  res.json(result);
}

// Delete a board and EVERYTHING under it (no orphans left). Guarded: a non-empty
// board must be archived first — this prevents an accidental irreversible wipe
// (we have no trash/recovery). Empty boards can be deleted directly.
async function deleteBoard(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const board = await db.collection('boards').findOne({ _id: boardId });
  if (!board) return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });

  const cards = await db.collection('cards').find({ boardId }).toArray();
  if (cards.length > 0 && !board.isArchived) {
    return res.status(409).json({
      error: { message: 'Archive the board before deleting it.', code: 'BOARD_NOT_EMPTY' },
    });
  }

  const cardIds = cards.map(c => c._id);
  const comments = await db.collection('comments').find({ cardId: { $in: cardIds } }).toArray();
  const subtasks = await db.collection('subtasks').find({ cardId: { $in: cardIds } }).toArray();

  // Best-effort S3 cleanup of EVERY file this board owns: card attachments, inline images
  // in card descriptions and comment bodies (card AND subtask comments — both carry
  // cardId), and SUBTASK attachments, which are their own files and would otherwise leak.
  // Non-fatal.
  await deleteUrls([
    ...cards.flatMap(c => (c.attachments || []).map(a => a.url)),
    ...cards.flatMap(c => s3UrlsInHtml(c.descriptionHtml)),
    ...comments.flatMap(c => s3UrlsInHtml(c.bodyHtml)),
    ...subtasks.flatMap(t => (t.attachments || []).map(a => a.url)),
    ...subtasks.flatMap(t => s3UrlsInHtml(t.notesHtml)),
  ]);

  // Cascade: children first, then the board itself.
  await Promise.all([
    db.collection('subtasks').deleteMany({ cardId: { $in: cardIds } }),
    db.collection('comments').deleteMany({ cardId: { $in: cardIds } }),
  ]);
  await Promise.all([
    db.collection('cards').deleteMany({ boardId }),
    db.collection('columns').deleteMany({ boardId }),
    db.collection('custom_fields').deleteMany({ boardId }),
    db.collection('card_templates').deleteMany({ boardId }),
  ]);
  await db.collection('boards').deleteOne({ _id: boardId });
  res.status(204).end();
}

module.exports = { listBoards, getBoard, createBoard, updateBoard, deleteBoard };
