'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { deleteByUrl, s3UrlsInHtml, deleteUrls } = require('../lib/s3');

async function addAttachment(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { name, url, isImage } = req.body;
  if (!url) return res.status(400).json({ error: { message: 'url is required', code: 'VALIDATION' } });
  const att = { name: name || 'file', url, isImage: !!isImage, inline: false, createdAt: new Date() };
  const result = await db.collection('cards').findOneAndUpdate(
    { _id: cardId },
    { $push: { attachments: att }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function removeAttachment(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: { message: 'url is required', code: 'VALIDATION' } });
  const result = await db.collection('cards').findOneAndUpdate(
    { _id: cardId },
    { $pull: { attachments: { url } }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });
  try { await deleteByUrl(url); } catch { /* leave the orphan; not fatal */ }
  res.json(result);
}

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

// Subtask/comment counts for every card on a board, as { cardId: {...} }.
//
// A SEPARATE endpoint on purpose. Folding this into listCards added ~2s to Rachel's
// 2,423 cards (two grouped aggregations over 7.7k subtasks and 20.4k comments), and the
// board is deliberately frame-first — the client fetches this after the cards are on
// screen and merges it in. Subtasks and comments carry no boardId, so the $in over card
// ids is the only way to scope it.
async function listCardCounts(req, res) {
  const db = await getDb();
  const boardId = new ObjectId(req.params.id);

  const ids = (await db.collection('cards')
    .find({ boardId }, { projection: { _id: 1 } }).toArray()).map(c => c._id);
  if (!ids.length) return res.json({});

  const [subs, comments] = await Promise.all([
    db.collection('subtasks').aggregate([
      { $match: { cardId: { $in: ids } } },
      { $group: { _id: '$cardId', total: { $sum: 1 }, done: { $sum: { $cond: ['$isComplete', 1, 0] } } } },
    ]).toArray(),
    db.collection('comments').aggregate([
      { $match: { cardId: { $in: ids } } },
      { $group: { _id: '$cardId', total: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const out = {};
  for (const s of subs) out[s._id] = { subtaskCount: s.total, subtaskDone: s.done, commentCount: 0 };
  for (const c of comments) {
    out[c._id] = { subtaskCount: 0, subtaskDone: 0, ...(out[c._id] || {}), commentCount: c.total };
  }
  res.json(out);
}

async function getCard(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const card = await db.collection('cards').findOne({ _id: cardId });
  if (!card) return res.status(404).json({ error: { message: 'Card not found', code: 'NOT_FOUND' } });

  const [comments, subtasks] = await Promise.all([
    // subtaskId must be excluded: subtask comments carry cardId too (so the card/board
    // delete cascades reach them), so an unfiltered query pulls a subtask's notes into
    // its parent's thread. Same filter as listComments.
    db.collection('comments')
      .find({ cardId, subtaskId: { $in: [null, undefined] } })
      .sort({ createdAt: 1 })
      .toArray(),
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
  // Lumina link: we persist ONLY ids (+ a display name, so the panel header can
  // render before the live fetch lands). The data itself is always re-pulled from
  // Lumina, never copied into the card. Pass null to detach.
  if (req.body.lumina !== undefined) {
    const l = req.body.lumina;
    // Cards map to a LINE ITEM (that's what buyers work on and what Lumina deep-links
    // to). advertiserId is kept alongside it for context. Older cards linked before
    // this change have only advertiserId — both shapes stay readable.
    $set.lumina = l && (l.lineitemId || l.advertiserId)
      ? {
          lineitemId: l.lineitemId ? String(l.lineitemId) : null,
          advertiserId: l.advertiserId ? String(l.advertiserId) : null,
          name: l.name || l.advertiserName || '',
          attachedAt: new Date(),
        }
      : null;
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
    // Clean up any S3 files this card owns: standalone attachments + inline images
    // embedded in its description HTML. (No comments here — isEmpty requires 0.)
    await deleteUrls([
      ...(card.attachments || []).map(a => a.url),
      ...s3UrlsInHtml(card.descriptionHtml),
    ]);
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

module.exports = { listCards, listCardCounts, getCard, createCard, updateCard, deleteCard, moveCard, moveCardToBoard, reorderCards, setFieldValues, addAttachment, removeAttachment };
