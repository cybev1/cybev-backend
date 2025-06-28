// routes/live.routes.js
const express = require('express');
const router = express.Router();
const { getLiveStreams } = require('../controllers/live.controller');

router.get('/', getLiveStreams);

module.exports = router;
