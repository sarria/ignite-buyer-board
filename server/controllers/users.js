'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

async function listUsers(req, res) {
  const db = await getDb();
  const users = await db.collection('users').find().sort({ name: 1 }).toArray();
  res.json(users);
}

async function createUser(req, res) {
  const db = await getDb();
  const { name, email, role = 'member' } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: { message: 'name and email are required', code: 'VALIDATION' } });
  }
  const doc = { name, email, role, createdAt: new Date() };
  const result = await db.collection('users').insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
}

async function updateUser(req, res) {
  const db = await getDb();
  const userId = new ObjectId(req.params.id);
  const { name, role, defaultBoardId, deactivated } = req.body;
  const $set = {};
  if (name !== undefined) $set.name = name;
  if (role !== undefined) $set.role = role;
  if (defaultBoardId !== undefined) $set.defaultBoardId = new ObjectId(defaultBoardId);
  if (deactivated !== undefined) $set.deactivated = !!deactivated;

  const result = await db.collection('users').findOneAndUpdate(
    { _id: userId },
    { $set },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
  res.json(result);
}

async function deleteUser(req, res) {
  const db = await getDb();
  const userId = new ObjectId(req.params.id);
  const result = await db.collection('users').findOneAndUpdate(
    { _id: userId },
    { $set: { deactivated: true } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
  res.status(204).end();
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
