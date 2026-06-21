'use strict';

const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/boards');
const columnCtrl = require('../controllers/columns');
const fieldCtrl = require('../controllers/fields');
const cardCtrl = require('../controllers/cards');
const templateCtrl = require('../controllers/templates');

const router = Router();

router.get('/', c.listBoards);
router.post('/', requireAdmin, c.createBoard);

// Columns nested under board
router.get('/:id/columns', columnCtrl.listColumns);
router.post('/:id/columns', columnCtrl.createColumn);
router.put('/:id/columns/reorder', columnCtrl.reorderColumns);

// Custom fields nested under board
router.get('/:id/fields', fieldCtrl.listFields);
router.post('/:id/fields', fieldCtrl.createField);
router.put('/:id/fields/reorder', fieldCtrl.reorderFields);

// Cards nested under board
router.get('/:id/cards', cardCtrl.listCards);
router.post('/:id/cards', cardCtrl.createCard);
router.put('/:id/cards/reorder', cardCtrl.reorderCards);

// Templates nested under board
router.get('/:id/templates', templateCtrl.listTemplates);
router.post('/:id/templates', templateCtrl.createTemplate);
router.put('/:id/templates/reorder', templateCtrl.reorderTemplates);

// Board CRUD — /:id must come after all /:id/nested routes
router.get('/:id', c.getBoard);
router.put('/:id', requireAdmin, c.updateBoard);
router.delete('/:id', requireAdmin, c.deleteBoard);

module.exports = router;
