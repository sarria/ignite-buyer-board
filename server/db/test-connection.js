'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { connectDb, closeDb } = require('./index');

(async () => {
  try {
    const db = await connectDb();
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name).join(', ') || '(none yet)');
    console.log('Step 1 passed: DB connected and indexes created successfully.');
  } catch (err) {
    console.error('Step 1 FAILED:', err.message);
    process.exit(1);
  } finally {
    await closeDb();
  }
})();
