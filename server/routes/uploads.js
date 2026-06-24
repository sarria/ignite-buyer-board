'use strict';

const express = require('express');
const router = express.Router();
const c = require('../controllers/uploads');

router.post('/presign', c.presign);

module.exports = router;
