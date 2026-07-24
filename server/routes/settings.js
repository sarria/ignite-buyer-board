'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/settings');

// Everyone reads (the card panel needs it); only admins change it.
router.get('/lumina-fields', c.getLuminaFields);
router.put('/lumina-fields', requireAdmin, c.updateLuminaFields);
router.delete('/lumina-fields', requireAdmin, c.resetLuminaFields);

module.exports = router;
