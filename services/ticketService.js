const TicketModel = require('../models/ticket');
const ClientModel = require('../models/client');
const UserModel = require('../models/user');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// stripHtml — strips HTML tags & decodes common HTML entities
// Microsoft Graph API returns email bodies as full HTML documents.
// We strip them before saving to DB so the frontend renders clean plain text.
// ─────────────────────────────────────────────────────────────────────────────
const stripHtml = (str) => {
    if (!str) return '';
    return str
        .replace(/<style[\s\S]*?<\/style>/gi, '') // remove <style> blocks entirely
        .replace(/<script[\s\S]*?<\/script>/gi, '') // remove <script> blocks
        .replace(/<br\s*\/?>/gi, '\n') // <br> → newline
        .replace(/<\/p>/gi, '\n') // </p> → newline
        .replace(/<\/div>/gi, '\n') // </div> → newline
        .replace(/<[^>]+>/g, '') // strip remaining tags
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]{2,}/g, ' ') // collapse multiple spaces
        .replace(/\n{3,}/g, '\n\n') // collapse excessive newlines
        .trim();
};
// We need to circular dependency? emailService uses ticketService. 
// ticketService needs emailService to send auto-reply. 
// Standard pattern: pass emailService function or require it inside function to avoid top-level cyclic dependency if needed, 
// or rely on a separate notification service.
// For now, I will require emailService inside the function or use a different structure if needed. 
// But let's try top-level first, if it breaks, I'll move it.
// Actually, emailService imports ticketService. If I import emailService here, it will be a cycle.
// Better to emit an event or break the cycle. 
// I will lazy-load emailService inside the function.

const generateTicketId = async (ticketType = 'Client') => {
    // Simple ID generation
    const tickets = await TicketModel.findAllTickets();
    const count = tickets.length;
    if (ticketType === 'Vendor') {
        return `#V${1000 + count + 1}`;
    }
    return `#${1000 + count + 1}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// findExistingTicketForReply
// Checks if an incoming email is a reply to an existing ticket using:
//   1. In-Reply-To header  → matches Ticket.messageId (most reliable)
//   2. References header   → checks each ID in the chain
//   3. Re: subject match   → last resort for clients that strip headers
// ─────────────────────────────────────────────────────────────────────────────
const findExistingTicketForReply = async (inReplyTo, references, subject) => {
    // 0. Strategy A: Subject regex extraction (Most Reliable)
    // Agent replies always have "[#1234]" in the subject.
    if (subject) {
        const ticketIdMatch = subject.match(/\[(#\d+)\]/);
        if (ticketIdMatch && ticketIdMatch[1]) {
            const friendlyId = ticketIdMatch[1]; // e.g. "#1001"
            const tickets = await TicketModel.findAllTickets();
            const ticket = tickets.find(t => t.ticketId === friendlyId);
            if (ticket) {
                logger.info(`🧵 Reply matched via Subject ID: ${friendlyId} → Ticket ${ticket.ticketId}`);
                return ticket;
            }
        }
    }

    // 1. Strategy B.1: In-Reply-To matches the Original Ticket Message-ID
    if (inReplyTo) {
        const cleanId = inReplyTo.trim();
        const ticket = await TicketModel.findTicketByMessageId(cleanId);
        if (ticket) {
            logger.info(`🧵 Reply matched via In-Reply-To (Ticket): ${cleanId} → Ticket ${ticket.ticketId}`);
            return ticket;
        }

        // 1.5. Strategy B.2: In-Reply-To matches an Agent Reply Message-ID
        const reply = await TicketModel.findReplyByMessageId(cleanId);
        if (reply && reply.ticket) {
            logger.info(`🧵 Reply matched via In-Reply-To (Agent Reply): ${cleanId} → Ticket ${reply.ticket.ticketId}`);
            return reply.ticket;
        }
    }

    // 2. References: space/comma-separated chain of parent Message-IDs
    if (references) {
        const refIds = (Array.isArray(references) ? references : references.split(/[\s,]+/))
            .map(r => r.trim())
            .filter(Boolean);
        for (const refId of refIds) {
            const ticket = await TicketModel.findTicketByMessageId(refId);
            if (ticket) {
                logger.info(`🧵 Reply matched via References: ${refId} → Ticket ${ticket.ticketId}`);
                return ticket;
            }
        }
    }

    // 3. Subject fallback: "Re: <original subject>" — strip Re:/Fwd: prefixes and match
    if (subject) {
        const stripped = subject.replace(/^(Re|Fwd|FW|RE|FWD):\s*/gi, '').trim();
        if (stripped) {
            const allTickets = await TicketModel.findAllTickets();
            const match = allTickets.find(t =>
                t.header && t.header.replace(/^(Re|Fwd|FW|RE|FWD):\s*/gi, '').trim() === stripped
            );
            if (match) {
                logger.info(`🧵 Reply matched via subject fallback: "${stripped}" → Ticket ${match.ticketId}`);
                return match;
            }
        }
    }

    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// appendClientReplyToTicket
// Appends a client's reply email to an existing ticket's conversation thread.
// Does NOT send another auto-reply (client already has the ticket open).
// ─────────────────────────────────────────────────────────────────────────────
const appendClientReplyToTicket = async (ticket, emailData) => {
    const { from, fromName, body, html, date } = emailData;
    const emailReceivedDate = date ? new Date(date) : new Date();

    logger.info(`📩 Appending client reply to existing Ticket ${ticket.ticketId} from ${from}`);

    const reply = await TicketModel.addReply(ticket.id, {
        text: stripHtml(body || html) || '(No Content)',
        time: emailReceivedDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }),
        date: emailReceivedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        author: fromName || from,
        type: 'client',
        category: 'client',
        to: [from],
    });

    // Log activity
    const ActivityLogModel = require('../models/activityLog');
    const now = new Date();
    await ActivityLogModel.createActivityLog({
        ticketId: ticket.id,
        action: 'client_replied',
        description: `Client ${fromName || from} replied to the ticket via email`,
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        author: fromName || from,
    });

    logger.info(`✅ Client reply appended to Ticket ${ticket.ticketId}`);
    return reply;
};

const createTicketFromEmail = async (emailData) => {
    const { from, fromName, subject, body, date, messageId, inReplyTo, references } = emailData;

    logger.debug(`📥 Processing incoming email from: ${from} | Subject: ${subject}`);

    try {
        // 0. Check if this email is a reply to an existing ticket
        const existingTicket = await findExistingTicketForReply(inReplyTo, references, subject);
        if (existingTicket) {
            return await appendClientReplyToTicket(existingTicket, emailData);
        }

        // 1. Identify Sender
        let clientId = null;
        let vendorId = null;
        let ticketType = 'Client';

        const clients = await ClientModel.findAllClients();
        const client = clients.find(c => c.emails.includes(from));

        if (client) {
            clientId = client.id;
            logger.debug(`👤 Identified sender as Client: ${client.name} (${client.id})`);
        } else {
            // Check Vendor
            const VendorModel = require('../models/vendor');
            const vendors = await VendorModel.findAllVendors();
            const vendor = vendors.find(v => v.emails.includes(from));
            
            if (vendor) {
                vendorId = vendor.id;
                ticketType = 'Vendor';
                logger.debug(`🏢 Identified sender as Vendor: ${vendor.name} (${vendor.id})`);
            } else {
                logger.debug(`❓ Sender not identified as existing client or vendor.`);
            }
        }

        // 2. Parse Subject for Circuit ID
        // Format: "98765432 || SF/SFO - TOK/HND-002"
        let circuitId = null;
        let parsedHeader = subject;

        const circuitRegex = /^(\d+)\s*\|\|\s*(.+)$/;
        const match = subject.match(circuitRegex);

        if (match) {
            const refNum = match[1];
            circuitId = match[2].trim();
            // Keep the original subject as header, or format it? 
            // User said: "98765432" is reference number, "SF/SFO..." is circuit ID.
            // Let's keep the full subject as header for context, but store circuitId separately.
            logger.info(`🔌 Found Circuit ID: ${circuitId} (Ref: ${refNum})`);
        }

        // 3. Generate ID
        const ticketId = await generateTicketId(ticketType);
        logger.debug(`🆔 Generated ${ticketType} Ticket ID: ${ticketId}`);

        // 4. Use REAL email received timestamp, not current time
        logger.info('⏰⏰⏰ PERMAN is fetching time... ⏰⏰⏰');
        logger.debug(`⏰ Raw Date from Email Parameter: ${date}`);
        const emailReceivedDate = date ? new Date(date) : new Date();
        logger.info(`⏰ PERMAN Calculated Received Date: ${emailReceivedDate.toISOString()}`);
        logger.info(`⏰ PERMAN Formatted Time: ${emailReceivedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`);

        // 5. Create Ticket with real timestamp
        const ticket = await TicketModel.createTicket({
            ticketId,
            header: subject || 'No Subject',
            email: from,
            status: 'Open',
            priority: 'Medium',
            circuitId: circuitId, // Add circuitId to ticket
            messageId: messageId, // Store original email messageId for threading
            receivedAt: emailReceivedDate, // NEW: Store ISO timestamp
            receivedTime: emailReceivedDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }), // NEW: Store display time (24-hour format)
            date: emailReceivedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            clientId: clientId,
            vendorId: vendorId,
            ticketType: ticketType,
            replies: {
                create: {
                    text: stripHtml(body) || '(No Content)',
                    time: emailReceivedDate.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }), // FIXED: Use email time, not current time
                    date: emailReceivedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                    author: fromName || from,
                    type: ticketType.toLowerCase(),
                    category: ticketType.toLowerCase(),
                    to: [from],
                }
            },
            activityLogs: {
                create: {
                    action: 'created',
                    description: `Ticket created from email by ${fromName || from}`,
                    time: emailReceivedDate.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }),
                    date: emailReceivedDate.toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                    }),
                    author: fromName || from
                }
            }
        });


        logger.info(`✅ ${ticketType} Ticket Created Successfully: ${ticket.ticketId} at ${ticket.receivedTime}`);

        // 6. Send Auto-Reply with 5-second delay (Only for Clients)
        if (ticketType === 'Vendor') {
            logger.info(`⏰ Skipping auto-reply for Vendor ticket ${ticket.ticketId} to prevent infinite automated loops.`);
            return ticket;
        }
        // Lazy load emailService to avoid circular dependency
        const emailService = require('./emailService');

        logger.info(`⏰ Scheduling auto-reply to ${from} in 5 seconds...`);

        setTimeout(async () => {
            try {
                logger.info(`🔄 Initiating auto-reply sequence for Ticket ${ticket.ticketId}...`);
                await emailService.sendEmail({
                    to: from,
                    subject: `Ticket Received: ${ticket.ticketId} - ${subject}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; color: #333;">
                            <p>Thank you for reaching out to us. We have received your ticket and our team will get back to you as soon as possible.</p>
                            <p>Please note that this is an automated response and this email box is not be monitored.</p>
                            <br/>
                            <p>Sorry for Inconvenience.</p>
                            <hr/>
                            <p style="font-size: 12px; color: #666;">EdgeStone Support Team</p>
                        </div>
                    `,
                    text: `Thank you for reaching out to us. We have received your ticket and our team will get back to you as soon as possible. Please note that this is an automated response and this email box is not be monitored.`,
                    inReplyTo: messageId,
                    references: messageId
                });

                logger.info(`📤 Auto-reply sent successfully to ${from}`);

                // Log auto-reply activity
                const ActivityLogModel = require('../models/activityLog');
                const now = new Date();
                await ActivityLogModel.createActivityLog({
                    ticketId: ticket.id,
                    action: 'auto_replied',
                    description: 'Auto-reply sent to customer',
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
                    author: 'System'
                });
            } catch (error) {
                logger.error(`❌ FAILED to send auto-reply for Ticket ${ticket.ticketId}`);
                logger.error(`❌ Reason: ${error.message}`);
                logger.error(`⚠️ Check EMAIL_PROVIDER and provider credentials (ZEPTO_MAIL_TOKEN / RESEND_API_KEY).`, { stack: error.stack });
            }
        }, 5000); // 5 seconds delay

        return ticket;

    } catch (error) {
        logger.error(`❌ Error in createTicketFromEmail: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

const getTickets = async () => {
    logger.debug('📋 Fetching all tickets...');
    const tickets = await TicketModel.findAllTickets({
        include: {
            replies: {
                orderBy: {
                    createdAt: 'asc'
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
    logger.debug(`🔢 Retrieved ${tickets.length} tickets.`);
    return tickets;
};

const replyToTicket = async (ticketId, message, agentEmail, agentName) => {
    logger.info(`↩️ Processing reply to ticket ${ticketId} by ${agentName} (${agentEmail})`);

    try {
        // 1. Find Ticket
        // Assuming ticketId is the Friendly ID (#1234) or UUID? 
        // Frontend URL shows /Tickets/98765432... which looks like the header/circuit info?
        // But usually API uses ID. Let's assume passed ID is the UUID or we lookup by FriendlyID.
        // TicketModel.findById looks for UUID. 
        // Let's try to find by FriendlyID first if it starts with #, else UUID.
        let ticket;
        if (ticketId.startsWith('#')) {
            // We need a findByTicketId method in model, or findAll and find.
            const tickets = await TicketModel.findAllTickets();
            ticket = tickets.find(t => t.ticketId === ticketId);
        } else {
            ticket = await TicketModel.findTicketById(ticketId);
        }

        if (!ticket) {
            throw new Error(`Ticket not found: ${ticketId}`);
        }

        // 2. Create Reply Record
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
            category: 'client', // Keeping in same thread
            to: [ticket.email],
            // cc: [],
            // bcc: []
        });

        logger.info(`✅ Reply added to database for Ticket ${ticket.ticketId}`);

        // 3. Send Email to Client via Zoho Mail OAuth (supports In-Reply-To/References for threading)
        const emailService = require('./emailService');
        logger.info(`📧 Sending Agent Reply Email to: ${ticket.email} | Subject: Re: ${ticket.header}`);
        const sentResult = await emailService.sendAgentReplyEmail({
            to: ticket.email,
            subject: `Re: ${ticket.header} [${ticket.ticketId}]`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <br/>
                    <hr/>
                    <p style="font-size: 12px; color: #666;">${agentName}<br/>EdgeStone Support</p>
                </div>
            `,
            text: message,
            inReplyTo: ticket.messageId,   // Threads reply into client's original email
            references: ticket.messageId   // Chains the full conversation thread
        });

        logger.info(`📤 Reply email sent to ${ticket.email}`);

        // Try to capture and save the outgoing Message-ID for future reverse-matching
        try {
            // Nodemailer returns messageId directly on the info object
            const outboundMessageId = sentResult?.messageId;

            if (outboundMessageId) {
                await TicketModel.updateReply(reply.id, { messageId: outboundMessageId });
                logger.info(`💾 Saved outbound messageId ${outboundMessageId} to Reply record for threading.`);
            }
        } catch (captureErr) {
            logger.warn(`⚠️ Failed to capture outbound messageId: ${captureErr.message}`);
        }

        // 4. Log activity
        const ActivityLogModel = require('../models/activityLog');
        const now = new Date();
        await ActivityLogModel.createActivityLog({
            ticketId: ticket.id,
            action: 'replied',
            description: `${agentName} replied to the ticket`,
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
            author: agentName
        });

        logger.info(`📊 Activity logged: reply by ${agentName}`);

        return reply;

    } catch (error) {
        logger.error(`❌ Error in replyToTicket: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

const updateTicket = async (ticketId, updates, agentName) => {
    logger.info(`🔄 Updating ticket ${ticketId} by ${agentName}`);
    logger.debug(`Updates: ${JSON.stringify(updates)}`);

    try {
        // 1. Find the ticket
        let ticket;
        if (ticketId.startsWith('#')) {
            const tickets = await TicketModel.findAllTickets();
            ticket = tickets.find(t => t.ticketId === ticketId);
        } else {
            ticket = await TicketModel.findTicketById(ticketId);
        }

        if (!ticket) {
            throw new Error(`Ticket not found: ${ticketId}`);
        }

        const ActivityLogModel = require('../models/activityLog');
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const dateString = now.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        // 2. Determine if we should auto-transition to "In Progress"
        let finalUpdates = { ...updates };

        // Check if ticket is currently "Open" and we're setting circuit/priority
        if (ticket.status === 'Open') {
            const settingCircuit = updates.circuitId && !ticket.circuitId;
            const hasPriority = updates.priority || ticket.priority;

            // Auto-transition to "In Progress" if circuit is being set and priority exists
            if (settingCircuit && hasPriority) {
                finalUpdates.status = 'In Progress';
                logger.info(`✨ Auto-transitioning ticket to "In Progress" (circuit + priority set)`);

                // Log the auto-transition
                await ActivityLogModel.createActivityLog({
                    ticketId: ticket.id,
                    action: 'status_changed',
                    description: `Status automatically changed to "In Progress" (circuit and priority assigned)`,
                    time: timeString,
                    date: dateString,
                    author: agentName,
                    oldValue: ticket.status,
                    newValue: 'In Progress',
                    fieldName: 'status'
                });
            }
        }

        // 3. Log individual field changes
        if (updates.circuitId && updates.circuitId !== ticket.circuitId) {
            await ActivityLogModel.createActivityLog({
                ticketId: ticket.id,
                action: 'updated',
                description: `Circuit ID ${ticket.circuitId ? 'updated' : 'assigned'}: ${updates.circuitId}`,
                time: timeString,
                date: dateString,
                author: agentName,
                oldValue: ticket.circuitId || 'None',
                newValue: updates.circuitId,
                fieldName: 'circuitId'
            });
        }

        if (updates.priority && updates.priority !== ticket.priority) {
            await ActivityLogModel.createActivityLog({
                ticketId: ticket.id,
                action: 'priority_changed',
                description: `Priority changed from "${ticket.priority}" to "${updates.priority}"`,
                time: timeString,
                date: dateString,
                author: agentName,
                oldValue: ticket.priority,
                newValue: updates.priority,
                fieldName: 'priority'
            });
        }

        // Log manual status change (if different from auto-transition)
        if (updates.status && updates.status !== ticket.status && updates.status !== finalUpdates.status) {
            await ActivityLogModel.createActivityLog({
                ticketId: ticket.id,
                action: 'status_changed',
                description: `Status changed from "${ticket.status}" to "${updates.status}"`,
                time: timeString,
                date: dateString,
                author: agentName,
                oldValue: ticket.status,
                newValue: updates.status,
                fieldName: 'status'
            });
        }

        // 4. Update the ticket
        const updatedTicket = await TicketModel.updateTicket(ticket.id, finalUpdates);

        logger.info(`✅ Ticket ${ticket.ticketId} updated successfully. New status: ${updatedTicket.status}`);

        return updatedTicket;

    } catch (error) {
        logger.error(`❌ Error in updateTicket: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// replyToVendor — Agent sends a reply to the vendor NOC email linked to the ticket.
// Mirrors replyToTicket exactly but targets vendorEmail and saves category='vendor'.
// ─────────────────────────────────────────────────────────────────────────────
const replyToVendor = async (ticketId, message, agentEmail, agentName) => {
    logger.info(`🔄 replyToVendor: Ticket ${ticketId} | Agent: ${agentName}`);

    try {
        // 1. Fetch the ticket
        const ticket = await TicketModel.findById(ticketId);
        if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

        // Determine vendor email — stored on the ticket, or fall back to env default
        const vendorContactEmail = ticket.vendorEmail || process.env.DEFAULT_VENDOR_EMAIL;
        if (!vendorContactEmail) {
            throw new Error(`No vendor email for ticket ${ticket.ticketId}. Set vendorEmail on ticket or DEFAULT_VENDOR_EMAIL in .env.`);
        }

        logger.info(`📧 replyToVendor: Sending email to vendor: ${vendorContactEmail}`);

        // 2. Save the reply in DB with category: 'vendor'
        const reply = await TicketModel.addReply(ticket.id, {
            text: message,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            author: agentName || 'Agent',
            type: 'agent',
            category: 'vendor',
            to: [vendorContactEmail],
        });

        logger.info(`✅ Vendor reply saved to DB for Ticket ${ticket.ticketId}`);

        // 3. Send email to vendor via Graph API
        const emailService = require('./emailService');
        await emailService.sendAgentReplyEmail({
            to: vendorContactEmail,
            subject: `Re: ${ticket.header} [${ticket.ticketId}]`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <br/>
                    <hr/>
                    <p style="font-size: 12px; color: #666;">${agentName}<br/>EdgeStone Support</p>
                </div>
            `,
            text: message,
        });

        logger.info(`📤 Vendor reply email sent to ${vendorContactEmail}`);

        // 4. Log activity
        const ActivityLogModel = require('../models/activityLog');
        const now = new Date();
        await ActivityLogModel.createActivityLog({
            ticketId: ticket.id,
            action: 'vendor_replied',
            description: `${agentName} sent a reply to vendor (${vendorContactEmail})`,
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            author: agentName
        });

        return reply;

    } catch (error) {
        logger.error(`❌ Error in replyToVendor: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

module.exports = {
    createTicketFromEmail,
    getTickets,
    updateTicket,
    replyToTicket,
    replyToVendor
};

