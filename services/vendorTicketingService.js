const TicketModel = require('../models/ticket');
const logger = require('../utils/logger');
const prisma = require('../models/index');

// ─────────────────────────────────────────────────────────────────────────────
// getVendorEmailsForTicket
// ─────────────────────────────────────────────────────────────────────────────
const getVendorEmailsForTicket = async (ticketId) => {
    let ticket;
    if (ticketId.startsWith('#')) {
        const tickets = await TicketModel.findAllTickets();
        ticket = tickets.find(t => t.ticketId === ticketId);
    } else {
        ticket = await TicketModel.findTicketById(ticketId);
    }
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    let emails = [];
    if (ticket.vendorId) {
        const VendorModel = require('../models/vendor');
        const vendor = await VendorModel.findVendorById(ticket.vendorId);
        if (vendor && vendor.emails) emails = vendor.emails;
    } else if (ticket.circuitId) {
        const circuit = await prisma.circuit.findUnique({
            where: { customerCircuitId: ticket.circuitId },
            include: { vendor: true }
        });
        if (circuit && circuit.vendor && circuit.vendor.emails) {
            emails = circuit.vendor.emails;
        }
    }
    return emails;
};

// ─────────────────────────────────────────────────────────────────────────────
// replyToVendor
// Separated out to isolate vendor routing logic from the primary client ticketing
// ─────────────────────────────────────────────────────────────────────────────
const replyToVendor = async (ticketId, emailData, agentEmail, agentName) => {
    logger.info(`🔄 replyToVendor: Ticket ${ticketId} | Agent: ${agentName}`);

    try {
        const { message, to, cc, bcc, subject } = emailData;

        // 1. Fetch the ticket
        let ticket;
        if (ticketId.startsWith('#')) {
            const tickets = await TicketModel.findAllTickets();
            ticket = tickets.find(t => t.ticketId === ticketId);
        } else {
            ticket = await TicketModel.findTicketById(ticketId);
        }
        if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

        let vendorContactEmails = [];
        
        if (to && Array.isArray(to) && to.length > 0) {
            vendorContactEmails = to; // Use frontend provided explicit targets
        } else {
            // Determine vendor email — fetch from associated vendor, or via circuit, or fall back to env default
            let vendorContactEmail = process.env.DEFAULT_VENDOR_EMAIL;
            
            if (ticket.vendorId) {
                const VendorModel = require('../models/vendor');
                const vendor = await VendorModel.findVendorById(ticket.vendorId);
                if (vendor && vendor.emails && vendor.emails.length > 0) {
                    vendorContactEmail = vendor.emails[0];
                }
            } else if (ticket.circuitId) {
                // Fallback: If ticket is a client ticket but has a circuit, look up the circuit's vendor
                const circuit = await prisma.circuit.findUnique({
                    where: { customerCircuitId: ticket.circuitId },
                    include: { vendor: true }
                });
                
                if (circuit && circuit.vendor && circuit.vendor.emails && circuit.vendor.emails.length > 0) {
                    vendorContactEmail = circuit.vendor.emails[0];
                }
            }
            
            if (!vendorContactEmail) {
                throw new Error(`No vendor email found for ticket ${ticket.ticketId}. Please make sure the assigned vendor has an email address, or set DEFAULT_VENDOR_EMAIL in .env.`);
            }
            vendorContactEmails = [vendorContactEmail];
        }

        logger.info(`📧 replyToVendor: Sending email to vendor emails: ${vendorContactEmails.join(', ')}`);

        // 2. Create Reply Record natively mapped to the vendor category
        const reply = await TicketModel.addReply(ticket.id, {
            text: message,
            time: new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }),
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            author: agentName || 'Agent',
            type: 'agent',
            category: 'vendor', // Explicitly marking this thread as vendor-side
            to: vendorContactEmails,
            cc: cc || [],
            bcc: bcc || []
        });

        logger.info(`✅ Vendor Reply added to database for Ticket ${ticket.ticketId}`);

        // 3. Send Email explicitly to the vendor
        const emailService = require('./emailService');
        
        // Provide the ticket's messageId so the email threads properly on the vendor side
        const threadMessageId = ticket.messageId || null;

        const sentResult = await emailService.sendAgentReplyEmail({
            to: vendorContactEmails,
            cc: cc || [],
            bcc: bcc || [],
            subject: subject || `Vendor Support Request: ${ticket.header} [${ticket.ticketId}]`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <p>Hello Vendor Support Team,</p>
                    <p>Regarding circuit/reference <strong>${ticket.circuitId || ticket.ticketId}</strong>:</p>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <br/>
                    <hr/>
                    <p style="font-size: 12px; color: #666;">${agentName}<br/>EdgeStone NOC / Partner Support</p>
                </div>
            `,
            text: message,
            inReplyTo: threadMessageId, 
            references: threadMessageId 
        });

        logger.info(`📤 Vendor reply email successfully routed to ${vendorContactEmails.join(', ')}`);

        // 4. BULLETPROOF THREADING FIX: Save the outbound messageId!
        // When the vendor replies, their email client will include this exact ID in the 'In-Reply-To' header.
        // The backend `findExistingTicketForReply` will securely map it back using this ID, ignoring subject line completely.
        try {
            const outboundMessageId = sentResult?.messageId;
            if (outboundMessageId) {
                await TicketModel.updateReply(reply.id, { messageId: outboundMessageId });
                logger.info(`💾 Saved outbound messageId ${outboundMessageId} to Vendor Reply for structural threading.`);
            }
        } catch (captureErr) {
            logger.warn(`⚠️ Failed to capture vendor outbound messageId: ${captureErr.message}`);
        }

        // Log Activity
        await prisma.activityLog.create({
            data: {
                action: 'vendor_replied',
                description: `Agent ${agentName} replied in the vendor thread to ${vendorContactEmails.join(', ')}.`,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                author: agentName || 'System',
                ticketId: ticket.id
            }
        });

        return reply;
    } catch (error) {
        logger.error(`❌ replyToVendor Error: ${error.message}`);
        throw error;
    }
};

module.exports = {
    getVendorEmailsForTicket,
    replyToVendor
};
