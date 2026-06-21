'use strict';

const { Router } = require('express');
const c = require('../controllers/templates');

const router = Router({ mergeParams: true });

router.get('/', c.listTemplates);
router.post('/', c.createTemplate);
router.put('/:id', c.updateTemplate);
router.delete('/:id', c.deleteTemplate);
router.post('/:id/apply', c.applyTemplate);

module.exports = router;
