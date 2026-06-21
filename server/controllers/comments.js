'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

async function listComments(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const comments = await db.collection('comments').find({ cardId }).sort({ createdAt: 1 }).toArray();
  res.json(comments);
}

async function createComment(req, res) {
  const db = await getDb();
  const cardId = new ObjectId(req.params.id);
  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: { message: 'body is required', code: 'VALIDATION' } });
  }

  const doc = {
    cardId,
    authorId: new ObjectId(req.user._id),
    body: body.trim(),
    isMigrated: false,
    createdAt: new Date(),
  };
  const result = await db.collection('comments').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateComment(req, res) {
  const db = await getDb();
  const commentId = new ObjectId(req.params.id);
  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: { message: 'body is required', code: 'VALIDATION' } });
  }

  const comment = await db.collection('comments').findOne({ _id: commentId });
  if (!comment) return res.status(404).json({ error: { message: 'Comment not found', code: 'NOT_FOUND' } });

  const isAuthor = comment.authorId?.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: { message: 'Not allowed to edit this comment', code: 'FORBIDDEN' } });
  }

  const result = await db.collection('comments').findOneAndUpdate(
    { _id: commentId },
    { $set: { body: body.trim() } },
    { returnDocument: 'after' }
  );
  res.json(result);
}

async function deleteComment(req, res) {
  const db = await getDb();
  const commentId = new ObjectId(req.params.id);
  const result = await db.collection('comments').deleteOne({ _id: commentId });
  if (result.deletedCount === 0) return res.status(404).json({ error: { message: 'Comment not found', code: 'NOT_FOUND' } });
  res.status(204).end();
}

module.exports = { listComments, createComment, updateComment, deleteComment };
