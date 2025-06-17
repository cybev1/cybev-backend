
const express = require('express');
const router = express.Router();
const { toggleUserStatus } = require('../controllers/toggle-status.controller');
const checkRole = require('../middleware/checkRole');

router.patch('/toggle-status', checkRole('super-admin'), toggleUserStatus);

module.exports = router;
