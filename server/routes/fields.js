'use strict';

const { Router } = require('express');
const c = require('../controllers/fields');

const router = Router();

router.put('/:id', c.updateField);
router.delete('/:id', c.deleteField);

module.exports = router;
