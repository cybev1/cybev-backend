
const express = require('express');
const router = express.Router();
const { listAllUsers } = require('../controllers/user-list.controller');
const checkRole = require('../middleware/checkRole');

router.get('/list', checkRole('super-admin'), listAllUsers);

module.exports = router;
