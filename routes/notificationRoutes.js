const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Open SSE connection
router.get('/stream', notificationController.streamNotifications);

// REST Endpoints
router.get('/', notificationController.getNotifications);
router.put('/read-all', notificationController.markAllAsRead);
router.put('/:id/read', notificationController.markAsRead);

module.exports = router;
