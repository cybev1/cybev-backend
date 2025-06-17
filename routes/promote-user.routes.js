
const express = require('express');
const router = express.Router();
const { promoteUserRole } = require('../controllers/promote-user.controller');
const checkRole = require('../middleware/checkRole');

router.post('/promote-user', checkRole('super-admin'), promoteUserRole);

module.exports = router;
