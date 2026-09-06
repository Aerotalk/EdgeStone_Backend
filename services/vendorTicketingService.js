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
    logger.info(`🎟️ [TICKET] 🔄 replyToVendor: Ticket ${ticketId} | Agent: ${agentName}`);

    try {
        const { message, to, cc, bcc, subject, htmlContent, attachments } = emailData;
        logger.info(`🎟️ [TICKET] DEBUG emailData keys: ${Object.keys(emailData).join(', ')}`);
        logger.info(`🎟️ [TICKET] DEBUG htmlContent exists? ${!!htmlContent}`);

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

        logger.info(`🎟️ [TICKET] 📧 replyToVendor: Sending email to vendor emails: ${vendorContactEmails.join(', ')}`);

        // CHG-017: Filter CC to protect client-side privacy when emailing vendors
        const clientEmails = new Set();
        if (ticket.email) clientEmails.add(ticket.email.toLowerCase().trim());
        if (ticket.clientId) {
            try {
                const ClientModel = require('../models/client');
                const client = await ClientModel.findClientById(ticket.clientId);
                if (client && client.emails) {
                    client.emails.forEach(e => clientEmails.add(e.toLowerCase().trim()));
                }
            } catch (err) {
                logger.error(`Error loading client emails: ${err.message}`);
            }
        }
        const commonPublicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
        const clientDomains = Array.from(clientEmails)
            .map(e => e.split('@')[1])
            .filter(d => d && !commonPublicDomains.includes(d.toLowerCase()));

        const isClientPerson = (email) => {
            if (!email) return false;
            const clean = email.toLowerCase().trim();
            if (clientEmails.has(clean)) return true;
            const domain = clean.split('@')[1];
            if (domain && clientDomains.includes(domain)) return true;
            return false;
        };

        let visibleVendorCc = [];
        let hiddenVendorBcc = Array.isArray(bcc) ? [...bcc] : [];

        (cc || []).forEach(email => {
            if (isClientPerson(email)) {
                // Client-side recipient MUST NOT be visible in vendor headers! Move to BCC!
                if (!hiddenVendorBcc.includes(email)) {
                    hiddenVendorBcc.push(email);
                }
                logger.info(`🔒 [VENDOR PRIVACY] Moved client-side recipient "${email}" from CC to BCC to prevent exposure to vendor.`);
            } else {
                visibleVendorCc.push(email);
            }
        });

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
            category: emailData.vendorId ? `vendor_${emailData.vendorId}` : 'vendor', // Explicitly marking this thread as vendor-side
            to: vendorContactEmails,
            cc: cc || [],
            bcc: hiddenVendorBcc,
            attachments: attachments || []
        });

        logger.info(`🎟️ [TICKET] ✅ Vendor Reply added to database for Ticket ${ticket.ticketId}`);

        // CHG-015: Persist any new CC recipients to ticket.cc
        if (cc && cc.length > 0) {
            try {
                const existingCcs = Array.isArray(ticket.cc) ? ticket.cc : [];
                const mergedCcs = Array.from(new Set([...existingCcs, ...cc].map(e => e.trim().toLowerCase()))).filter(Boolean);
                await prisma.ticket.update({
                    where: { id: ticket.id },
                    data: { cc: { set: mergedCcs } }
                });
            } catch (ccSaveErr) {
                logger.error(`Failed to update ticket.cc in replyToVendor: ${ccSaveErr.message}`);
            }
        }

        const emailService = require('./emailService');
        
        // 3.5 Find last message ID in thread for accurate In-Reply-To
        const replies = await prisma.reply.findMany({
            where: { ticketId: ticket.id, messageId: { not: null }, category: emailData.vendorId ? `vendor_${emailData.vendorId}` : 'vendor' },
            orderBy: { createdAt: 'desc' },
            take: 1
        });
        const threadMessageId = (replies.length > 0 && replies[0].messageId) ? replies[0].messageId : (ticket.messageId || null);

        // CHG-015: Fetch previous vendor thread history to append to outbound email
        const previousVendorReplies = await prisma.reply.findMany({
            where: {
                ticketId: ticket.id,
                category: emailData.vendorId ? { in: [`vendor_${emailData.vendorId}`, 'vendor'] } : { startsWith: 'vendor' }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        let vendorThreadHistoryHtml = '';
        let vendorThreadHistoryText = '';

        if (previousVendorReplies.length > 0 || ticket.circuitId || ticket.header) {
            vendorThreadHistoryHtml = `
                <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: Arial, sans-serif; color: #475569; font-size: 13px;">
                    <div style="font-weight: bold; color: #334155; margin-bottom: 12px; font-size: 13px;">--- Previous Conversation ---</div>
            `;
            vendorThreadHistoryText = '\n\n--- Previous Conversation ---\n';

            for (const prev of previousVendorReplies) {
                const authorDisplay = prev.author || 'Vendor NOC';
                const timeDisplay = `${prev.date || ''} ${prev.time || ''}`.trim();
                const textBody = (prev.text || '').replace(/\n/g, '<br>');

                vendorThreadHistoryHtml += `
                    <div style="margin-bottom: 16px; padding-left: 12px; border-left: 2px solid #cbd5e1;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">
                            <strong>${authorDisplay}</strong> • ${timeDisplay}
                        </div>
                        <div style="color: #334155; line-height: 1.5;">${textBody}</div>
                    </div>
                `;
                vendorThreadHistoryText += `\n[${timeDisplay}] ${authorDisplay}:\n${prev.text || ''}\n`;
            }

            if (ticket.circuitId) {
                vendorThreadHistoryHtml += `
                    <div style="margin-bottom: 16px; padding-left: 12px; border-left: 2px solid #cbd5e1;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">
                            <strong>Circuit Reference</strong>: ${ticket.circuitId}
                        </div>
                        <div style="color: #334155; line-height: 1.5;">Request: ${ticket.header}</div>
                    </div>
                `;
                vendorThreadHistoryText += `\n[Circuit: ${ticket.circuitId}] Request: ${ticket.header}\n`;
            }

            vendorThreadHistoryHtml += `</div>`;
        }

        const emailHtml = htmlContent
            ? `
                <div style="font-family: Arial, sans-serif; margin-bottom: 16px;">
                    <p>Hello Vendor Support Team,</p>
                    <p>Regarding case number <strong>${ticket.ticketId}</strong>:</p>
                </div>
                ${htmlContent}
                ${vendorThreadHistoryHtml}
              `
            : `
                <div style="font-family: Arial, sans-serif;">
                    <p>Hello Vendor Support Team,</p>
                    <p>Regarding case number <strong>${ticket.ticketId}</strong>:</p>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <br/>
                    <hr/>
                    <p style="font-size: 12px; color: #666;">${agentName}<br/>EdgeStone NOC / Partner Support</p>
                </div>
                ${vendorThreadHistoryHtml}
            `;

        const sentResult = await emailService.sendAgentReplyEmail({
            to: vendorContactEmails,
            cc: visibleVendorCc,
            bcc: hiddenVendorBcc,
            subject: subject ? 
                (subject.includes(`[${ticket.ticketId}`) ? subject : `Re: [${ticket.ticketId}-V] ${subject}`) : 
                `[${ticket.ticketId}-V] Vendor Support Request: ${ticket.header}`,
            html: emailHtml,
            text: (message || '') + vendorThreadHistoryText,
            inReplyTo: threadMessageId, 
            references: threadMessageId,
            attachments: attachments || []
        });

        logger.info(`🎟️ [TICKET] 📤 Vendor reply email successfully routed to ${vendorContactEmails.join(', ')}`);

        // 4. BULLETPROOF THREADING FIX: Save the outbound messageId!
        // When the vendor replies, their email client will include this exact ID in the 'In-Reply-To' header.
        // The backend `findExistingTicketForReply` will securely map it back using this ID, ignoring subject line completely.
        try {
            const outboundMessageId = sentResult?.messageId;
            if (outboundMessageId) {
                await TicketModel.updateReply(reply.id, { messageId: outboundMessageId });
                logger.info(`🎟️ [TICKET] 💾 Saved outbound messageId ${outboundMessageId} to Vendor Reply for structural threading.`);
            }
        } catch (captureErr) {
            logger.warn(`⚠️ 🎟️ [TICKET] ⚠️ Failed to capture vendor outbound messageId: ${captureErr.message}`);
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
        logger.error(`🚨 🎟️ [TICKET] ❌ replyToVendor Error: ${error.message}`);
        throw error;
    }
};

module.exports = {
    getVendorEmailsForTicket,
    replyToVendor
};
