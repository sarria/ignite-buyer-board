'use strict';

const { Router } = require('express');
const c = require('../controllers/files');

const router = Router();

// Wildcard: keys are multi-segment (buyer-board/uploads/<uuid>-<name>).
router.get('/*key', c.getFile);

module.exports = router;
