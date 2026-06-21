'use strict';

const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/comments');

const router = Router();

router.put('/:id', c.updateComment);
router.delete('/:id', requireAdmin, c.deleteComment);

module.exports = router;
