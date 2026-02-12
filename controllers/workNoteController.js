const workNoteService = require('../services/workNoteService');
const logger = require('../utils/logger');

/**
 * Create a work note for a ticket
 */
const createWorkNote = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const { text } = req.body;
        const userId = req.user?.id;
        const userName = req.user?.name || 'Agent';

        logger.info(`📝 Request to create work note for ticket ${ticketId}`);

        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'Work note text is required' });
        }

        const workNote = await workNoteService.createWorkNote(
            ticketId,
            text,
            userId,
            userName
        );

        res.status(201).json({
            message: 'Work note created successfully',
            workNote
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all work notes for a ticket
 */
const getWorkNotes = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        logger.debug(`📋 Request to fetch work notes for ticket ${ticketId}`);

        const workNotes = await workNoteService.getWorkNotes(ticketId);

        res.json(workNotes);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createWorkNote,
    getWorkNotes
};
