'use strict';

const { Router } = require('express');
const c = require('../controllers/savedFilters');

const router = Router();

router.delete('/:id', c.deleteSavedFilter);

module.exports = router;
