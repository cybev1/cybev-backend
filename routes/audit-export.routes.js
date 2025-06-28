
const express = require('express');
const router = express.Router();
const { exportAuditLogsAsPDF } = require('../controllers/audit-export.controller');
const checkRole = require('../middleware/checkRole');

router.get('/export-pdf', checkRole('super-admin'), exportAuditLogsAsPDF);

module.exports = router;
