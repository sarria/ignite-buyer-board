'use strict';

const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/cards');
const subtaskCtrl = require('../controllers/subtasks');
const commentCtrl = require('../controllers/comments');

const router = Router();

// Standalone card routes
router.get('/:id', c.getCard);
router.put('/:id', c.updateCard);
router.delete('/:id', requireAdmin, c.deleteCard);
router.put('/:id/move', c.moveCard);
router.put('/:id/move-board', c.moveCardToBoard);
router.put('/:id/fields', c.setFieldValues);

// Subtasks nested under card
router.post('/:id/subtasks', subtaskCtrl.createSubtask);
router.put('/:id/subtasks/reorder', subtaskCtrl.reorderSubtasks);

// Comments nested under card
router.get('/:id/comments', commentCtrl.listComments);
router.post('/:id/comments', commentCtrl.createComment);

module.exports = router;
