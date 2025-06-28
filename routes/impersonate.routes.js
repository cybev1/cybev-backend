
const express = require('express');
const router = express.Router();
const { impersonateUser, revertImpersonation } = require('../controllers/impersonate.controller');
const checkRole = require('../middleware/checkRole');

router.post('/impersonate', checkRole('super-admin'), impersonateUser);
router.post('/impersonate/revert', checkRole('super-admin'), revertImpersonation);

module.exports = router;
