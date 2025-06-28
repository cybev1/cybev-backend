const express = require('express');
const router = express.Router();
const { boostPost } = require('../controllers/boost.controller');

router.post('/post/boost', boostPost);

module.exports = router;