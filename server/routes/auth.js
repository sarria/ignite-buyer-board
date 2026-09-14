'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const c = require('../controllers/auth');

const router = Router();

// Public — these are how you GET a session, so they can't require one.
router.get('/config', c.config);
router.get('/login', c.login);
router.get('/callback', c.callback);

router.get('/me', requireAuth, c.me);

module.exports = router;
