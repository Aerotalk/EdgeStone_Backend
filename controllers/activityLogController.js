const activityLogService = require('../services/activityLogService');
const logger = require('../utils/logger');
const { getISTString } = require('../utils/timeUtils');

/**
 * Get all activity logs for a ticket
 */
const getActivityLogs = async (req, res, next) => {
    try {
        const { ticketId } = req.params;

        // Detailed Entry Logging
        const requestMethod = req.method;
        const requestUrl = req.originalUrl;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.get('User-Agent');
        const userId = req.user ? req.user.id : 'Unauthenticated';
        const userName = req.user ? req.user.name : 'Unknown';

        logger.info(`📜 [ACTIVITY] 
🚨 ENTRY LOG: Ticket Reply View Opened 🚨
--------------------------------------------------
🕒 Timestamp (IST) : ${getISTString()}
🆔 Ticket ID       : ${ticketId}
👤 User            : ${userName} (ID: ${userId})
🔗 Endpoint        : ${requestMethod} ${requestUrl}
🌐 IP Address      : ${userIp}
🖥️ User Agent      : ${userAgent}
--------------------------------------------------
`);

        logger.debug(`🐞 📜 [ACTIVITY] 📋 Fetching activity logs for ticket ${ticketId}`);

        const logs = await activityLogService.getActivityLogs(ticketId);

        res.json(logs);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getActivityLogs
};
