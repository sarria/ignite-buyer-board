'use strict';

const express = require('express');
const router = express.Router();
const c = require('../controllers/lumina');

router.get('/status', c.status);
router.get('/advertisers', c.searchAdvertisers);
router.get('/advertisers/:id', c.getAdvertiser);
router.get('/lineitems', c.searchLineItems);
router.get('/lineitems/:id', c.getLineItem);

module.exports = router;
