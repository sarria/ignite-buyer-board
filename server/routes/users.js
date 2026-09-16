'use strict';

const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/users');

const router = Router();

router.get('/', c.listUsers);
router.post('/', requireAdmin, c.createUser);
router.put('/me/board-prefs/:boardId', c.updateMyBoardPrefs);
router.put('/:id', requireAdmin, c.updateUser);
router.post('/:id/merge', requireAdmin, c.mergeUser);
router.delete('/:id', requireAdmin, c.deleteUser);

module.exports = router;
