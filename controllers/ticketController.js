const ticketService = require('../services/ticketService');
const logger = require('../utils/logger');

const getTickets = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: getTickets');
        const tickets = await ticketService.getTickets();
        res.json(tickets);
    } catch (error) {
        next(error);
    }
};

const createTicket = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: createTicket (Manual)');
        // Logic
        res.json({ message: 'Create Ticket' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTickets,
    createTicket
};
