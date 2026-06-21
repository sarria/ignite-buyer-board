'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

const VALID_TYPES = ['text', 'number', 'date', 'url', 'enum'];

async function listFields(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const fields = await db.collection('custom_fields').find({ boardId }).sort({ position: 1 }).toArray();
  res.json(fields);
}

async function createField(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const { name, type, options = [], isRequired = false } = req.body;

  if (!name) return res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION' } });
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: { message: `type must be one of: ${VALID_TYPES.join(', ')}`, code: 'VALIDATION' } });
  }

  const last = await db.collection('custom_fields').findOne({ boardId }, { sort: { position: -1 } });
  const position = last ? last.position + 1 : 0;

  const doc = { boardId, name, type, options: type === 'enum' ? options : [], isRequired, position };
  const result = await db.collection('custom_fields').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateField(req, res) {
  const db = await getDb();
  const fieldId = new ObjectId(req.params.id);
  const { name, type, options, isRequired } = req.body;
  const $set = {};
  if (name !== undefined) $set.name = name;
  if (type !== undefined) $set.type = type;
  if (options !== undefined) $set.options = options;
  if (isRequired !== undefined) $set.isRequired = isRequired;

  const result = await db.collection('custom_fields').findOneAndUpdate(
    { _id: fieldId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Field not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function deleteField(req, res) {
  const db = await getDb();
  const fieldId = new ObjectId(req.params.id);
  const result = await db.collection('custom_fields').deleteOne({ _id: fieldId });
  if (result.deletedCount === 0) return res.status(404).json({ error: { message: 'Field not found', code: 'NOT_FOUND' } });
  res.status(204).end();
}

async function reorderFields(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const { fieldIds } = req.body;
  if (!Array.isArray(fieldIds)) {
    return res.status(400).json({ error: { message: 'fieldIds array required', code: 'VALIDATION' } });
  }

  const ops = fieldIds.map((id, position) => ({
    updateOne: { filter: { _id: new ObjectId(id), boardId }, update: { $set: { position } } },
  }));
  await db.collection('custom_fields').bulkWrite(ops);
  res.status(204).end();
}

module.exports = { listFields, createField, updateField, deleteField, reorderFields };
