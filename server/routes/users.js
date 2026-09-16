'use strict';

const { Router } = require('express');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const c = require('../controllers/users');

const router = Router();

router.get('/', c.listUsers);
router.post('/', requireAdmin, c.createUser);
router.put('/me/board-prefs/:boardId', c.updateMyBoardPrefs);
router.put('/:id', requireAdmin, c.updateUser);
// Super-admin only — see requireSuperAdmin. This fixes identity-matching problems
// (duplicate users from an email mismatch) that are ours to solve, not a board
// admin's tool.
router.post('/:id/merge', requireSuperAdmin, c.mergeUser);
router.delete('/:id', requireAdmin, c.deleteUser);

module.exports = router;
