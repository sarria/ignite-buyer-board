'use strict';

const { Router } = require('express');
const c = require('../controllers/subtasks');
const commentCtrl = require('../controllers/comments');

const router = Router();

// Comments nested under a subtask — must come before /:id so it isn't swallowed.
router.get('/:id/comments', commentCtrl.listSubtaskComments);
router.post('/:id/comments', commentCtrl.createSubtaskComment);

router.post('/:id/attachments', c.addSubtaskAttachment);
router.delete('/:id/attachments', c.removeSubtaskAttachment);

router.put('/:id', c.updateSubtask);
router.delete('/:id', c.deleteSubtask);

module.exports = router;
