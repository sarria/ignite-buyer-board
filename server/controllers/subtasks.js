'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { s3UrlsInHtml, deleteUrls } = require('../lib/s3');

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
  const { title, assigneeId, dueDate, isComplete, notes, notesHtml } = req.body;
  const $set = {};
  if (title !== undefined) $set.title = title;
  if (assigneeId !== undefined) $set.assigneeId = assigneeId ? new ObjectId(assigneeId) : null;
  if (dueDate !== undefined) $set.dueDate = dueDate ? new Date(dueDate) : null;
  if (isComplete !== undefined) $set.isComplete = isComplete;
  if (notes !== undefined) $set.notes = notes;
  // Rich notes mirror a card's description/descriptionHtml pair: `notes` stays the
  // plain-text version (what the Asana import wrote, and what search would use),
  // `notesHtml` is the rendered one. null = plain.
  if (notesHtml !== undefined) $set.notesHtml = notesHtml;

  const result = await db.collection('subtasks').findOneAndUpdate(
    { _id: subtaskId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Subtask not found', code: 'NOT_FOUND' } });
  res.json(result);
}

// Deleting a subtask takes its comments with it — and any inline images those comments
// hold (see Deletion & Cleanup Rules; inline images live in bodyHtml, not attachments[]).
// S3 cleanup is best-effort and must never block the DB delete.
async function deleteSubtask(req, res) {
  const db = await getDb();
  const subtaskId = new ObjectId(req.params.id);

  const subtask = await db.collection('subtasks').findOne({ _id: subtaskId });
  const comments = await db.collection('comments').find({ subtaskId }).toArray();
  await deleteUrls([
    ...comments.flatMap(c => s3UrlsInHtml(c.bodyHtml)),
    ...((subtask?.attachments || []).map(a => a.url)),
    ...s3UrlsInHtml(subtask?.notesHtml),
  ]);
  await db.collection('comments').deleteMany({ subtaskId });

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

// Attachments on a subtask, mirroring the card endpoints. Remove deletes from S3 too —
// the IAM policy needs s3:DeleteObject (see Files & Images).
async function addSubtaskAttachment(req, res) {
  const db = await getDb();
  const subtaskId = new ObjectId(req.params.id);
  const { name, url, isImage } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: { message: 'name and url are required', code: 'VALIDATION' } });
  }
  const result = await db.collection('subtasks').findOneAndUpdate(
    { _id: subtaskId },
    { $push: { attachments: { name, url, isImage: !!isImage, inline: false, createdAt: new Date() } } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Subtask not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function removeSubtaskAttachment(req, res) {
  const db = await getDb();
  const subtaskId = new ObjectId(req.params.id);
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: { message: 'url is required', code: 'VALIDATION' } });
  const result = await db.collection('subtasks').findOneAndUpdate(
    { _id: subtaskId },
    { $pull: { attachments: { url } } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'Subtask not found', code: 'NOT_FOUND' } });
  await deleteUrls([url]);   // best-effort, never blocks the DB change
  res.json(result);
}

module.exports = {
  createSubtask, updateSubtask, deleteSubtask, reorderSubtasks,
  addSubtaskAttachment, removeSubtaskAttachment,
};
