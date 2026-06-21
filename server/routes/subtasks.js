'use strict';

const { Router } = require('express');
const c = require('../controllers/subtasks');

const router = Router();

router.put('/:id', c.updateSubtask);
router.delete('/:id', c.deleteSubtask);

module.exports = router;
