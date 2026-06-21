'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

async function createSubtask(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { title, assigneeId, dueDate, notes = '' } = req.body;
  if (!title) return res.status(400).json({ error: { message: 'title is required', code: 'VALIDATION' } });

  const last = await db.collection('subtasks').findOne({ cardId }, { sort: { position: -1 } });
  const position = last ? last.position + 1 : 0;

  const doc = {
    cardId,
    title,
    assigneeId: assigneeId ? new ObjectId(assigneeId) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    isComplete: false,
    notes,
    position,
    createdAt: new Date(),
  };
  const result = await db.collection('subtasks').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateSubtask(req, res) {
  const db = await getDb();
  const subtaskId = new ObjectId(req.params.id);
  const { title, assigneeId, dueDate, isComplete, notes } = req.body;
  const $set = {};
  if (title !== undefined) $set.title = title;
  if (assigneeId !== undefined) $set.assigneeId = assigneeId ? new ObjectId(assigneeId) : null;
  if (dueDate !== undefined) $set.dueDate = dueDate ? new Date(dueDate) : null;
  if (isComplete !== undefined) $set.isComplete = isComplete;
  if (notes !== undefined) $set.notes = notes;

  const result = await db.collection('subtasks').findOneAndUpdate(
    { _id: subtaskId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Subtask not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function deleteSubtask(req, res) {
  const db = await getDb();
  const subtaskId = new ObjectId(req.params.id);
  const result = await db.collection('subtasks').deleteOne({ _id: subtaskId });
  if (result.deletedCount === 0) return res.status(404).json({ error: { message: 'Subtask not found', code: 'NOT_FOUND' } });
  res.status(204).end();
}

async function reorderSubtasks(req, res) {
  const db = await getDb();
  const { subtaskIds } = req.body;
  if (!Array.isArray(subtaskIds)) {
    return res.status(400).json({ error: { message: 'subtaskIds array required', code: 'VALIDATION' } });
  }
  const ops = subtaskIds.map((id, position) => ({
    updateOne: { filter: { _id: new ObjectId(id) }, update: { $set: { position } } },
  }));
  await db.collection('subtasks').bulkWrite(ops);
  res.status(204).end();
}

module.exports = { createSubtask, updateSubtask, deleteSubtask, reorderSubtasks };
