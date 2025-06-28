
const express = require('express');
const router = express.Router();
const { registerCustomDomain } = require('../controllers/domain.controller');

router.post('/custom-domain', registerCustomDomain);

module.exports = router;
