'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Sign-in routes come BEFORE the global gate — they are how a session is obtained,
// so they can't require one. /auth/me applies requireAuth itself.
app.use('/api/auth', require('./routes/auth'));

// Everything else requires a verified Microsoft SSO session.
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
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/lumina', require('./routes/lumina'));

// Health check (no auth)
app.get('/health', (req, res) => res.json({ ok: true }));

app.use(errorHandler);

module.exports = app;
