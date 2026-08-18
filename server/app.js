'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Auth applied globally; swap stub for real MSAL middleware here when ready
app.use('/api', requireAuth);

// TEMPORARY: lets the frontend access-gate detect whether a password is required
// and whether the one it holds is valid. Passes requireAuth above → 200 only when
// the password is correct (or the gate is disabled). Remove with the gate.
app.get('/api/auth/check', (req, res) => res.json({ ok: true }));

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
