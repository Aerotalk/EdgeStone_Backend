const ActivityLogModel = require('../models/activityLog');
const logger = require('../utils/logger');

/**
 * Log an activity for a ticket
 * @param {string} ticketId - Ticket ID
 * @param {string} action - Action type (created, updated, replied, etc.)
 * @param {string} description - Human-readable description
 * @param {string} author - Who performed the action
 * @param {string} oldValue - Old value (optional)
 * @param {string} newValue - New value (optional)
 * @param {string} fieldName - Field name that changed (optional)
 * @returns {Promise<Object>} Created activity log
 */
const logActivity = async (ticketId, action, description, author, oldValue = null, newValue = null, fieldName = null) => {
    const now = new Date();

    const activityLog = await ActivityLogModel.createActivityLog({
        ticketId,
        action,
        description,
        time: now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }),
        date: now.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }),
        author,
        oldValue,
        newValue,
        fieldName
    });

    logger.debug(`📊 Activity logged: ${action} for ticket ${ticketId}`);
    return activityLog;
};

/**
 * Get all activity logs for a ticket
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Array>} Array of activity logs
 */
const getActivityLogs = async (ticketId) => {
    logger.debug(`📋 Fetching activity logs for ticket ${ticketId}`);
    const logs = await ActivityLogModel.findActivityLogsByTicketId(ticketId);
    logger.debug(`🔢 Retrieved ${logs.length} activity logs.`);
    return logs;
};

module.exports = {
    logActivity,
    getActivityLogs
};
