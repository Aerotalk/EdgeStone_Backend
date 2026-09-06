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

    logger.debug(`🐞 📜 [ACTIVITY] 📊 Activity logged: ${action} for ticket ${ticketId}`);
    return activityLog;
};

/**
 * Get all activity logs for a ticket
 * @param {string} ticketIdParam - Ticket UUID or friendly ticket ID (e.g. #V1023)
 * @returns {Promise<Array>} Array of activity logs
 */
const getActivityLogs = async (ticketIdParam) => {
    if (!ticketIdParam) return [];
    logger.debug(`🐞 📜 [ACTIVITY] 📋 Fetching activity logs for ticket ${ticketIdParam}`);

    const prisma = require('../models/index');
    let actualTicketId = ticketIdParam;

    if (typeof ticketIdParam === 'string' && ticketIdParam.startsWith('#')) {
        const ticket = await prisma.ticket.findFirst({
            where: { ticketId: { equals: ticketIdParam, mode: 'insensitive' } },
            select: { id: true }
        });
        if (!ticket) return [];
        actualTicketId = ticket.id;
    } else {
        const ticket = await prisma.ticket.findFirst({
            where: { OR: [{ id: ticketIdParam }, { ticketId: ticketIdParam }] },
            select: { id: true }
        });
        if (!ticket) return [];
        actualTicketId = ticket.id;
    }

    const logs = await ActivityLogModel.findActivityLogsByTicketId(actualTicketId);
    logger.debug(`🐞 📜 [ACTIVITY] 🔢 Retrieved ${logs.length} activity logs for ticket ${actualTicketId}.`);
    return logs;
};

module.exports = {
    logActivity,
    getActivityLogs
};
