const ticketService = require('../services/ticketService');
const logger = require('../utils/logger');
const { getISTString } = require('../utils/timeUtils');

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

const replyTicket = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        // Assuming authMiddleware attaches user to req
        const agentName = req.user ? req.user.name : 'Agent';
        const agentEmail = req.user ? req.user.email : 'support@edgestone.in';

        // Detailed Reply Logging
        logger.info(`
📨 OUTGOING REPLY LOG 📨
--------------------------------------------------
🕒 Timestamp (IST) : ${getISTString()}
🆔 Ticket ID       : ${id}
👤 Sender          : ${agentName} <${agentEmail}>
📝 Content         : "${message.length > 100 ? message.substring(0, 100) + '...' : message}"
--------------------------------------------------
`);

        logger.info(`🗣️ Agent ${agentName} replying to ticket ${id}`);

        const reply = await ticketService.replyToTicket(id, message, agentEmail, agentName);
        res.status(201).json({ message: 'Reply sent successfully', reply });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTickets,
    createTicket,
    replyTicket
};
