'use strict';

const { MongoClient } = require('mongodb');

let client;
let db;

async function connectDb() {
  if (db) return db;

  client = new MongoClient(process.env.MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: false,
  });
  await client.connect();
  db = client.db();

  await createIndexes(db);
  console.log('MongoDB connected and indexes ensured');
  return db;
}

async function getDb() {
  // Lazily connect so serverless invocations (no startup connectDb) work too.
  if (db) return db;
  return connectDb();
}

async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

async function createIndexes(db) {
  // users
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ microsoftId: 1 }, { unique: true, sparse: true });

  // columns
  await db.collection('columns').createIndex({ boardId: 1, position: 1 });

  // custom_fields
  await db.collection('custom_fields').createIndex({ boardId: 1, position: 1 });

  // cards
  await db.collection('cards').createIndex({ boardId: 1 });
  await db.collection('cards').createIndex({ columnId: 1, position: 1 });
  await db.collection('cards').createIndex({ assigneeId: 1 });
  await db.collection('cards').createIndex({ asanaGid: 1 }, { sparse: true });
  await db.collection('cards').createIndex({ title: 'text' });

  // subtasks
  await db.collection('subtasks').createIndex({ cardId: 1, position: 1 });

  // comments
  await db.collection('comments').createIndex({ cardId: 1, createdAt: 1 });
}

module.exports = { connectDb, getDb, closeDb };
