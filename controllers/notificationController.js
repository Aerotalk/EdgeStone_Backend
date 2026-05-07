const notificationService = require('../services/notificationService');

/**
 * Handle SSE Stream Connection
 */
const streamNotifications = (req, res) => {
    notificationService.subscribe(req, res);
};

module.exports = {
    streamNotifications
};
