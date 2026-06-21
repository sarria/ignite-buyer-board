'use strict';

const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/users');

const router = Router();

router.get('/', c.listUsers);
router.post('/', requireAdmin, c.createUser);
router.put('/:id', c.updateUser);
router.delete('/:id', requireAdmin, c.deleteUser);

module.exports = router;
