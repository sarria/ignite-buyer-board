'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

async function listCards(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const filter = { boardId };

  if (req.query.assignee) filter.assigneeId = new ObjectId(req.query.assignee);
  if (req.query.column) filter.columnId = new ObjectId(req.query.column);

  const archived = req.query.archived;
  if (archived === 'true') filter.isArchived = true;
  else if (archived === 'false') filter.isArchived = false;
  else if (archived === 'all') { /* no filter — return both */ }
  else filter.isArchived = { $ne: true };

  if (req.query.search) filter.$text = { $search: req.query.search };

  const cards = await db.collection('cards').find(filter).sort({ columnId: 1, position: 1 }).toArray();
  res.json(cards);
}

async function getCard(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const card = await db.collection('cards').findOne({ _id: cardId });
  if (!card) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });

  const [comments, subtasks] = await Promise.all([
    db.collection('comments').find({ cardId }).sort({ createdAt: 1 }).toArray(),
    db.collection('subtasks').find({ cardId }).sort({ position: 1 }).toArray(),
  ]);
  res.json({ ...card, comments, subtasks });
}

async function createCard(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);
  const { title, columnId, assigneeId, dueDate, description = '', fieldValues = [] } = req.body;

  if (!title) return res.status(400).json({ error: { message: 'title is required', code: 'VALIDATION' } });
  if (!columnId) return res.status(400).json({ error: { message: 'columnId is required', code: 'VALIDATION' } });

  const colObjId = new ObjectId(columnId);
  const last = await db.collection('cards').findOne({ columnId: colObjId }, { sort: { position: -1 } });
  const position = last ? last.position + 1 : 0;

  const doc = {
    boardId,
    columnId: colObjId,
    title,
    assigneeId: assigneeId ? new ObjectId(assigneeId) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    description,
    position,
    isArchived: false,
    fieldValues,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection('cards').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateCard(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { title, assigneeId, dueDate, description, isArchived, isCompleted, tags } = req.body;
  const $set = { updatedAt: new Date() };

  if (title !== undefined) $set.title = title;
  if (assigneeId !== undefined) $set.assigneeId = assigneeId ? new ObjectId(assigneeId) : null;
  if (dueDate !== undefined) $set.dueDate = dueDate ? new Date(dueDate) : null;
  if (description !== undefined) $set.description = description;
  if (req.body.descriptionHtml !== undefined) $set.descriptionHtml = req.body.descriptionHtml;
  if (isArchived !== undefined) $set.isArchived = isArchived;
  if (isCompleted !== undefined) {
    $set.isCompleted = isCompleted;
    $set.completedAt = isCompleted ? new Date() : null;
  }
  if (tags !== undefined) {
    // Normalize: trim, drop empties, de-duplicate.
    $set.tags = [...new Set((tags || []).map(t => String(t).trim()).filter(Boolean))];
  }

  const result = await db.collection('cards').findOneAndUpdate(
    { _id: cardId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function deleteCard(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const card = await db.collection('cards').findOne({ _id: cardId });
  if (!card) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });

  const hasDescription = card.description?.trim().length > 0;
  const hasFieldValues = card.fieldValues?.some(fv =>
    fv.valueText || fv.valueEnum || fv.valueNumber != null || fv.valueDate
  );
  const commentCount = await db.collection('comments').countDocuments({ cardId });
  const subtaskCount = await db.collection('subtasks').countDocuments({ cardId });
  const isEmpty = !hasDescription && !hasFieldValues && commentCount === 0 && subtaskCount === 0;

  if (isEmpty) {
    await db.collection('cards').deleteOne({ _id: cardId });
    return res.json({ deleted: true });
  }

  // Card has data — archive instead
  const result = await db.collection('cards').findOneAndUpdate(
    { _id: cardId },
    { $set: { isArchived: true, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  res.json(result);
}

async function moveCard(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { columnId, position } = req.body;
  if (!columnId) return res.status(400).json({ error: { message: 'columnId is required', code: 'VALIDATION' } });

  const colObjId = new ObjectId(columnId);
  const column = await db.collection('columns').findOne({ _id: colObjId });
  if (!column) return res.status(404).json({ error: { message: 'Column not found', code: 'NOT_FOUND' } });

  const $set = {
    columnId: colObjId,
    updatedAt: new Date(),
  };
  if (position !== undefined) $set.position = position;

  const result = await db.collection('cards').findOneAndUpdate(
    { _id: cardId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function moveCardToBoard(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { boardId, columnId } = req.body;
  if (!boardId || !columnId) {
    return res.status(400).json({ error: { message: 'boardId and columnId are required', code: 'VALIDATION' } });
  }

  const colObjId = new ObjectId(columnId);
  const last = await db.collection('cards').findOne({ columnId: colObjId }, { sort: { position: -1 } });
  const position = last ? last.position + 1 : 0;

  const result = await db.collection('cards').findOneAndUpdate(
    { _id: cardId },
    { $set: { boardId: new ObjectId(boardId), columnId: colObjId, position, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function reorderCards(req, res) {
  const db = await getDb();
  const { cardIds } = req.body;
  if (!Array.isArray(cardIds)) {
    return res.status(400).json({ error: { message: 'cardIds array required', code: 'VALIDATION' } });
  }

  const ops = cardIds.map((id, position) => ({
    updateOne: { filter: { _id: new ObjectId(id) }, update: { $set: { position, updatedAt: new Date() } } },
  }));
  await db.collection('cards').bulkWrite(ops);
  res.status(204).end();
}

async function setFieldValues(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  // req.body: { fieldId: value, ... }
  const card = await db.collection('cards').findOne({ _id: cardId });
  if (!card) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });

  const incoming = req.body;
  let fieldValues = card.fieldValues || [];

  for (const [rawFieldId, value] of Object.entries(incoming)) {
    const fieldId = new ObjectId(rawFieldId);
    const field = await db.collection('custom_fields').findOne({ _id: fieldId });
    if (!field) continue;

    const entry = { fieldId };
    if (field.type === 'text' || field.type === 'url') entry.valueText = value;
    else if (field.type === 'number') entry.valueNumber = Number(value);
    else if (field.type === 'date') entry.valueDate = new Date(value);
    else if (field.type === 'enum') entry.valueEnum = value;

    const idx = fieldValues.findIndex(fv => fv.fieldId.toString() === rawFieldId);
    if (idx >= 0) fieldValues[idx] = entry;
    else fieldValues.push(entry);
  }

  const result = await db.collection('cards').findOneAndUpdate(
    { _id: cardId },
    { $set: { fieldValues, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  res.json(result);
}

module.exports = { listCards, getCard, createCard, updateCard, deleteCard, moveCard, moveCardToBoard, reorderCards, setFieldValues };
