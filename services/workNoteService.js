const WorkNoteModel = require('../models/workNote');
const ActivityLogModel = require('../models/activityLog');
const logger = require('../utils/logger');

/**
 * Create a work note for a ticket
 * @param {string} ticketId - Ticket ID
 * @param {string} text - Work note content
 * @param {string} userId - User ID (optional)
 * @param {string} userName - User name
 * @param {boolean} isSystem - Whether this is a system-generated note
 * @returns {Promise<Object>} Created work note
 */
const createWorkNote = async (ticketId, text, userId, userName, isSystem = false) => {
    logger.info(`📝 Creating work note for ticket ${ticketId} by ${userName}`);

    const now = new Date();
    const workNote = await WorkNoteModel.createWorkNote({
        text,
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
        author: userName,
        isSystem,
        userId,
        ticketId
    });

    // Create activity log for work note
    await ActivityLogModel.createActivityLog({
        ticketId,
        action: 'work_note_added',
        description: `${userName} added a work note`,
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
        author: userName
    });

    logger.info(`✅ Work note created successfully: ${workNote.id}`);
    return workNote;
};

/**
 * Get all work notes for a ticket
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Array>} Array of work notes
 */
const getWorkNotes = async (ticketId) => {
    logger.debug(`📋 Fetching work notes for ticket ${ticketId}`);
    const workNotes = await WorkNoteModel.findWorkNotesByTicketId(ticketId);
    logger.debug(`🔢 Retrieved ${workNotes.length} work notes.`);
    return workNotes;
};

module.exports = {
    createWorkNote,
    getWorkNotes
};
