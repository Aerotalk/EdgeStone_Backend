const TicketModel = require('../models/ticket');
const ClientModel = require('../models/client');
const UserModel = require('../models/user');
const logger = require('../utils/logger');
// We need to circular dependency? emailService uses ticketService. 
// ticketService needs emailService to send auto-reply. 
// Standard pattern: pass emailService function or require it inside function to avoid top-level cyclic dependency if needed, 
// or rely on a separate notification service.
// For now, I will require emailService inside the function or use a different structure if needed. 
// But let's try top-level first, if it breaks, I'll move it.
// Actually, emailService imports ticketService. If I import emailService here, it will be a cycle.
// Better to emit an event or break the cycle. 
// I will lazy-load emailService inside the function.

const generateTicketId = async () => {
    // Simple ID generation: # + 4 random digits or count. 
    // To be safe and simple: Timestamp based or Count.
    // Let's use count + 1000 for friendly IDs.
    const tickets = await TicketModel.findAllTickets();
    const count = tickets.length;
    return `#${1000 + count + 1}`;
};

const createTicketFromEmail = async (emailData) => {
    const { from, fromName, subject, body, date } = emailData;

    logger.debug(`📥 Processing incoming email from: ${from} | Subject: ${subject}`);

    try {
        // 1. Identify Sender
        // Check Client first
        let clientId = null;
        // Need to add findByEmail to ClientModel if not exists. 
        // ClientModel currently only has findById and create.
        // For now, use findAllClients and find. Inefficient but works for now.
        const clients = await ClientModel.findAllClients();
        const client = clients.find(c => c.emails.includes(from));

        if (client) {
            clientId = client.id;
            logger.debug(`👤 Identified sender as Client: ${client.name} (${client.id})`);
        } else {
            logger.debug(`❓ Sender not identified as existing client.`);
        }

        // Check User (Agent)? Typically agents don't create tickets via email this way, but if they do:
        // const user = await UserModel.findUserByEmail(from);

        // 2. Generate ID
        const ticketId = await generateTicketId();
        logger.debug(`🆔 Generated Ticket ID: ${ticketId}`);

        // 3. Create Ticket
        // Note: Schema doesn't have 'description', so we put body in the first Reply? 
        // Or we just assume header is subject. 
        // We will create the Ticket and the first Reply.

        // Transaction to ensure atomicity
        // Repository pattern abstractions often hide transaction capability unless exposed.
        // For now, we will just create normally. if it fails, it fails.
        // Or we can expose prisma.$transaction if needed, but we are abstracting it.

        const ticket = await TicketModel.createTicket({
            ticketId,
            header: subject || 'No Subject',
            email: from,
            status: 'Open',
            priority: 'Medium',
            date: date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            clientId: clientId,
            replies: {
                create: {
                    text: body || '(No Content)',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                    author: fromName || from,
                    type: 'client', // Assuming external sender is client/requestor
                    category: 'client', // Thread grouping
                    to: [from], // Initial sender
                }
            }
        });


        logger.info(`✅ Ticket Created Successfully: ${ticket.ticketId}`);

        // 4. Send Auto-Reply
        // Lazy load emailService to avoid circular dependency
        const emailService = require('./emailService');

        await emailService.sendEmail({
            to: from,
            subject: `Ticket Created: ${ticket.ticketId} - ${subject}`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Ticket Created Successfully</h2>
                    <p>Dear ${fromName || 'Customer'},</p>
                    <p>Thank you for contacting support. A new ticket has been created for your request.</p>
                    <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <br/>
                    <p>We will get back to you shortly.</p>
                    <hr/>
                    <p style="font-size: 12px; color: #666;">EdgeStone Support Team</p>
                </div>
            `,
            text: `Ticket Created: ${ticket.ticketId}. Thank you for contacting support.`
        });

        logger.info(`📤 Auto-reply sent to ${from}`);

        return ticket;

    } catch (error) {
        logger.error(`❌ Error in createTicketFromEmail: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

const getTickets = async () => {
    logger.debug('📋 Fetching all tickets...');
    const tickets = await TicketModel.findAllTickets();
    logger.debug(`🔢 Retrieved ${tickets.length} tickets.`);
    return tickets;
};

module.exports = {
    createTicketFromEmail,
    getTickets
};
