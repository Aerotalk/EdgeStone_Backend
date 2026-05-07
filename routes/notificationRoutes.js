const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Open SSE connection
router.get('/stream', notificationController.streamNotifications);

module.exports = router;
