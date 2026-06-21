'use strict';

const { Router } = require('express');
const c = require('../controllers/columns');

const router = Router();

router.put('/:id', c.updateColumn);
router.delete('/:id', c.deleteColumn);

module.exports = router;
