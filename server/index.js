'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Auth applied globally; swap stub for real MSAL middleware here when ready
app.use('/api', requireAuth);

// Routes
app.use('/api/boards', require('./routes/boards'));
app.use('/api/columns', require('./routes/columns'));
app.use('/api/fields', require('./routes/fields'));
app.use('/api/cards', require('./routes/cards'));
app.use('/api/subtasks', require('./routes/subtasks'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/templates', require('./routes/templates'));

// Health check (no auth)
app.get('/health', (req, res) => res.json({ ok: true }));

app.use(errorHandler);

const PORT = process.env.PORT || 3001;

connectDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('Failed to start:', err); process.exit(1); });
