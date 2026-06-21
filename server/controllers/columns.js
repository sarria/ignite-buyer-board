'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

async function listColumns(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const columns = await db.collection('columns').find({ boardId }).sort({ position: 1 }).toArray();
  res.json(columns);
}

async function createColumn(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const { name, color = '#e0e0e0' } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION' } });

  const last = await db.collection('columns').findOne({ boardId }, { sort: { position: -1 } });
  const position = last ? last.position + 1 : 0;

  const doc = { boardId, name, color, position, createdAt: new Date() };
  const result = await db.collection('columns').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateColumn(req, res) {
  const db = await getDb();
  const columnId = new ObjectId(req.params.id);
  const { name, color } = req.body;
  const $set = {};
  if (name !== undefined) $set.name = name;
  if (color !== undefined) $set.color = color;

  const result = await db.collection('columns').findOneAndUpdate(
    { _id: columnId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Column not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function deleteColumn(req, res) {
  const db = await getDb();
  const columnId = new ObjectId(req.params.id);
  const cardCount = await db.collection('cards').countDocuments({ columnId });
  if (cardCount > 0) {
    return res.status(409).json({ error: { message: 'Column must be empty before deleting', code: 'CONFLICT' } });
  }
  const result = await db.collection('columns').deleteOne({ _id: columnId });
  if (result.deletedCount === 0) return res.status(404).json({ error: { message: 'Column not found', code: 'NOT_FOUND' } });
  res.status(204).end();
}

async function reorderColumns(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const { columnIds } = req.body;
  if (!Array.isArray(columnIds)) {
    return res.status(400).json({ error: { message: 'columnIds array required', code: 'VALIDATION' } });
  }

  const ops = columnIds.map((id, position) => ({
    updateOne: { filter: { _id: new ObjectId(id), boardId }, update: { $set: { position } } },
  }));
  await db.collection('columns').bulkWrite(ops);
  res.status(204).end();
}

module.exports = { listColumns, createColumn, updateColumn, deleteColumn, reorderColumns };
