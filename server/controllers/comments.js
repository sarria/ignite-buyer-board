'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { s3UrlsInHtml, deleteUrls } = require('../lib/s3');

// A comment belongs to a CARD or to a SUBTASK. Subtask comments keep `cardId` as well as
// `subtaskId` — that's what lets the card and board delete cascades reach them without
// knowing subtasks exist. The trade-off is that every card-thread query MUST exclude them,
// or a subtask's notes leak into its parent's thread.
const CARD_THREAD = { $in: [null, undefined] };

async function listComments(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const comments = await db.collection('comments')
    .find({ cardId, subtaskId: CARD_THREAD })
    .sort({ createdAt: 1 })
    .toArray();
  res.json(comments);
}

async function listSubtaskComments(req, res) {
  const db = await getDb();
  const subtaskId = new ObjectId(req.params.id);
  const comments = await db.collection('comments')
    .find({ subtaskId })
    .sort({ createdAt: 1 })
    .toArray();
  res.json(comments);
}

async function createSubtaskComment(req, res) {
  const db = await getDb();
  const subtaskId = new ObjectId(req.params.id);
  const { body, bodyHtml } = req.body;
  if ((!body || !body.trim()) && (!bodyHtml || !bodyHtml.trim())) {
    return res.status(400).json({ error: { message: 'body is required', code: 'VALIDATION' } });
  }
  const subtask = await db.collection('subtasks').findOne({ _id: subtaskId }, { projection: { cardId: 1 } });
  if (!subtask) return res.status(404).json({ error: { message: 'Subtask not found', code: 'NOT_FOUND' } });

  const doc = {
    cardId: subtask.cardId,   // denormalised so the card/board cascades still reach it
    subtaskId,
    authorId: new ObjectId(req.user._id),
    body: (body || '').trim(),
    bodyHtml: bodyHtml || null,
    isMigrated: false,
    createdAt: new Date(),
  };
  const result = await db.collection('comments').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function createComment(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { body, bodyHtml } = req.body;
  if ((!body || !body.trim()) && (!bodyHtml || !bodyHtml.trim())) {
    return res.status(400).json({ error: { message: 'body is required', code: 'VALIDATION' } });
  }

  const doc = {
    cardId,
    authorId: new ObjectId(req.user._id),
    body: (body || '').trim(),
    bodyHtml: bodyHtml || null,
    isMigrated: false,
    createdAt: new Date(),
  };
  const result = await db.collection('comments').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateComment(req, res) {
  const db = await getDb();
  const commentId = new ObjectId(req.params.id);
  const { body, bodyHtml } = req.body;
  if ((!body || !body.trim()) && (!bodyHtml || !bodyHtml.trim())) {
    return res.status(400).json({ error: { message: 'body is required', code: 'VALIDATION' } });
  }

  const comment = await db.collection('comments').findOne({ _id: commentId });
  if (!comment) return res.status(404).json({ error: { message: 'Comment not found', code: 'NOT_FOUND' } });

  const isAuthor = comment.authorId?.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: { message: 'Not allowed to edit this comment', code: 'FORBIDDEN' } });
  }

  const $set = { editedAt: new Date() };
  if (body !== undefined) $set.body = (body || '').trim();
  if (bodyHtml !== undefined) $set.bodyHtml = bodyHtml || null;

  const result = await db.collection('comments').findOneAndUpdate(
    { _id: commentId },
    { $set },
    { returnDocument: 'after' }
  );
  res.json(result);
}

async function deleteComment(req, res) {
  const db = await getDb();
  const commentId = new ObjectId(req.params.id);
  const comment = await db.collection('comments').findOne({ _id: commentId });
  if (!comment) return res.status(404).json({ error: { message: 'Comment not found', code: 'NOT_FOUND' } });
  // Remove any inline images the comment owns in S3, then the doc.
  await deleteUrls(s3UrlsInHtml(comment.bodyHtml));
  await db.collection('comments').deleteOne({ _id: commentId });
  res.status(204).end();
}

module.exports = {
  listComments, createComment, updateComment, deleteComment,
  listSubtaskComments, createSubtaskComment,
};
