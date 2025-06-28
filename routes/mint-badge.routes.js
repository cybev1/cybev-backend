const express = require('express');
const router = express.Router();
const { mintBadge } = require('../controllers/mintBadge.controller');

router.post('/mint-badge', mintBadge);

module.exports = router;