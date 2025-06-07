
const express = require('express');
const router = express.Router();
const { registerSubdomain } = require('../controllers/domain.controller');

router.post('/subdomain', registerSubdomain);

module.exports = router;
