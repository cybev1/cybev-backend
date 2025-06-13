// routes/notifications.routes.js
const express = require('express');
const router = express.Router();
const { getNotifications } = require('../controllers/notifications.controller');

router.get('/', getNotifications);

module.exports = router;
