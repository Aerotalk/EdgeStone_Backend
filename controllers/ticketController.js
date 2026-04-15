const ticketService = require('../services/ticketService');
const vendorTicketingService = require('../services/vendorTicketingService');
const logger = require('../utils/logger');
const { getISTString } = require('../utils/timeUtils');

// ... (other controller methods remain pointing to ticketService)

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

const updateTicket = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { circuitId, priority, status } = req.body;

        logger.debug(`📝 Request received: updateTicket for ticket ${id}`);
        logger.debug(`Updates: circuitId=${circuitId}, priority=${priority}, status=${status}`);

        const agentName = req.user ? req.user.name : 'Agent';
        const agentEmail = req.user ? req.user.email : 'support@edgestone.in';

        const updatedTicket = await ticketService.updateTicket(
            id,
            { circuitId, priority, status },
            agentName
        );

        logger.info(`✅ Ticket ${id} updated successfully`);
        res.json({ message: 'Ticket updated successfully', ticket: updatedTicket });
    } catch (error) {
        logger.error(`❌ Error updating ticket: ${error.message}`);
        next(error);
    }
};

const replyTicket = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { message, htmlContent } = req.body;   // htmlContent = full HTML with signature
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
📝 Content         : "${message}"
🖊  Has HTML Sig   : ${!!htmlContent}
--------------------------------------------------
`);

        logger.info(`🗣️ Agent ${agentName} replying to ticket ${id}`);

        const reply = await ticketService.replyToTicket(id, message, agentEmail, agentName, htmlContent);
        res.status(201).json({ message: 'Reply sent successfully', reply });
    } catch (error) {
        next(error);
    }
};

const replyVendorTicket = async (req, res, next) => {
    try {
        const { id } = req.params;
        const emailData = req.body; 
        const agentName = req.user ? req.user.name : 'Agent';
        const agentEmail = req.user ? req.user.email : 'support@edgestone.in';

        logger.info(`📨 VENDOR REPLY | Ticket: ${id} | Agent: ${agentName}`);

        const reply = await vendorTicketingService.replyToVendor(id, emailData, agentEmail, agentName);
        res.status(201).json({ message: 'Vendor reply sent successfully', reply });
    } catch (error) {
        next(error);
    }
};

const getVendorEmails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const emails = await vendorTicketingService.getVendorEmailsForTicket(id);
        res.json({ emails });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTickets,
    createTicket,
    updateTicket,
    replyTicket,
    replyVendorTicket,
    getVendorEmails
};
