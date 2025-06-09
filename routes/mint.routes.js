const express = require('express');
const router = express.Router();
const { mintContentNFT } = require('../controllers/mint.controller');

router.post('/mint', mintContentNFT);

module.exports = router;