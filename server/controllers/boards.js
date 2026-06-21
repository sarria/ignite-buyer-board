'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

async function listBoards(req, res) {
  const db = await getDb();
  const boards = await db.collection('boards').find().sort({ name: 1 }).toArray();
  const columnCounts = await db
    .collection('columns')
    .aggregate([{ $group: { _id: '$boardId', count: { $sum: 1 } } }])
    .toArray();
  const countMap = Object.fromEntries(columnCounts.map(r => [r._id.toString(), r.count]));
  res.json(boards.map(b => ({ ...b, columnCount: countMap[b._id.toString()] || 0 })));
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

  const doc = { name, description, createdBy: new ObjectId(req.user._id), createdAt: new Date() };
  const result = await db.collection('boards').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateBoard(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const { name, description } = req.body;
  const $set = {};
  if (name !== undefined) $set.name = name;
  if (description !== undefined) $set.description = description;

  const result = await db.collection('boards').findOneAndUpdate(
    { _id: boardId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function deleteBoard(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const result = await db.collection('boards').deleteOne({ _id: boardId });
  if (result.deletedCount === 0) return res.status(404).json({ error: { message: 'Board not found', code: 'NOT_FOUND' } });
  res.status(204).end();
}

module.exports = { listBoards, getBoard, createBoard, updateBoard, deleteBoard };
