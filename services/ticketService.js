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

// ─────────────────────────────────────────────────────────────────────────────
// stripQuotedReply — Removes quoted email history from plain text email body.
// ─────────────────────────────────────────────────────────────────────────────
const stripQuotedReply = (text) => {
    if (!text) return '';
    
    // 1. Outlook / Exchange Style
    let idx = text.search(/From:\s.*?\nSent:\s/i);
    if (idx !== -1) text = text.substring(0, idx);

    // 2. Generic "Original Message" separator
    idx = text.search(/-+\s*Original Message\s*-+/i);
    if (idx !== -1) text = text.substring(0, idx);

    // 3. Gmail Style "On [date], [name] wrote:"
    // (We look for "On " followed by "wrote:" within a reasonable distance at the start of a line)
    idx = text.search(/(?:^|\n)\s*On\s+[\s\S]{10,150}?wrote:/i);
    if (idx !== -1) text = text.substring(0, idx);
    
    // 4. Sometimes Outlook includes "________________________________" before From:
    idx = text.search(/_{10,}/);
    if (idx !== -1) text = text.substring(0, idx);

    return text.trim();
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
    const prisma = require('../models/index');
    
    // To avoid Unique Constraint failures after test data deletions,
    // we must find the absolute highest numeric ID in the DB, not just table length.
    const tickets = await prisma.ticket.findMany({ select: { ticketId: true } });
    
    let maxId = 1000;
    for (const t of tickets) {
        // Extract numeric part from IDs like "#1051" or "#V1052"
        const numMatch = t.ticketId.match(/\d+/);
        if (numMatch) {
            const num = parseInt(numMatch[0], 10);
            if (num > maxId) {
                maxId = num;
            }
        }
    }
    
    const nextNum = maxId + 1;
    if (ticketType === 'Vendor') {
        return `#V${nextNum}`;
    }
    return `#${nextNum}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// findExistingTicketForReply
// Checks if an incoming email is a reply to an existing ticket using:
//   1. In-Reply-To header  → matches Ticket.messageId (most reliable)
//   2. References header   → checks each ID in the chain
//   3. Re: subject match   → last resort for clients that strip headers
// ─────────────────────────────────────────────────────────────────────────────
const findExistingTicketForReply = async (inReplyTo, references, subject, body = '', from = null) => {
    // 0. Strategy A: Subject regex extraction (Most Reliable)
    // Supports [#1234], [1234], [#V1234], [V1234], [#1234-V], [1234-V], [#TEST-MV-1234]
    if (subject) {
        const ticketIdMatch = subject.match(/\[#?([A-Za-z0-9_-]+?)(?:-V)?\]/i);
        if (ticketIdMatch && ticketIdMatch[1]) {
            const rawId = ticketIdMatch[1];
            const friendlyId = (rawId.startsWith('#') ? rawId : '#' + rawId).toUpperCase();
            const prisma = require('../models/index');
            const ticket = await prisma.ticket.findFirst({
                where: { ticketId: { equals: friendlyId, mode: 'insensitive' } },
                include: { client: true, vendor: true }
            });
            if (ticket) {
                logger.info(`🎟️ [TICKET] 🧵 Reply matched via Subject ID: ${friendlyId} → Ticket ${ticket.ticketId}`);
                return ticket;
            }
        }
    }

    // 1. Strategy B.1: In-Reply-To matches the Original Ticket Message-ID
    if (inReplyTo) {
        const cleanId = inReplyTo.trim();
        const ticket = await TicketModel.findTicketByMessageId(cleanId);
        if (ticket) {
            logger.info(`🎟️ [TICKET] 🧵 Reply matched via In-Reply-To (Ticket): ${cleanId} → Ticket ${ticket.ticketId}`);
            return ticket;
        }

        // 1.5. Strategy B.2: In-Reply-To matches an Agent Reply Message-ID
        const reply = await TicketModel.findReplyByMessageId(cleanId);
        if (reply && reply.ticket) {
            logger.info(`🎟️ [TICKET] 🧵 Reply matched via In-Reply-To (Agent Reply): ${cleanId} → Ticket ${reply.ticket.ticketId}`);
            reply.ticket._matchedReply = reply;
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
                logger.info(`🎟️ [TICKET] 🧵 Reply matched via References (Ticket): ${refId} → Ticket ${ticket.ticketId}`);
                return ticket;
            }
            const reply = await TicketModel.findReplyByMessageId(refId);
            if (reply && reply.ticket) {
                logger.info(`🎟️ [TICKET] 🧵 Reply matched via References (Reply): ${refId} → Ticket ${reply.ticket.ticketId}`);
                reply.ticket._matchedReply = reply;
                return reply.ticket;
            }
        }
    }

    // 3. Subject fallback: "Re: <original subject>" — strip Re:/Fwd: prefixes and match
    // STRICT ISOLATION: Must verify Circuit ID and Sender to prevent cross-client hijacking!
    if (subject) {
        const isReplyPattern = /^(Re|Fwd|FW|RE|FWD):\s*/i.test(subject);
        const stripped = subject.replace(/^(Re|Fwd|FW|RE|FWD):\s*/gi, '').trim();
        
        if (stripped && isReplyPattern) {
            const prisma = require('../models/index');
            // Fetch circuits to check if a circuit ID is explicitly mentioned in the reply
            const allCircuits = await prisma.circuit.findMany({
                select: { id: true, customerCircuitId: true, supplierCircuitId: true, clientId: true, vendorId: true }
            });
            
            const textToScan = `${subject} ${body || ''}`.toUpperCase();
            let detectedCircuitId = null;
            for (const c of allCircuits) {
                if (c.customerCircuitId && textToScan.includes(c.customerCircuitId.toUpperCase())) {
                    detectedCircuitId = c.customerCircuitId;
                    break;
                }
                if (c.supplierCircuitId && textToScan.includes(c.supplierCircuitId.toUpperCase())) {
                    detectedCircuitId = c.supplierCircuitId;
                    break;
                }
            }

            const allTickets = await prisma.ticket.findMany({ 
                where: {
                    status: { notIn: ['Spam'] }
                },
                include: { 
                    client: true, 
                    vendor: true,
                    replies: { select: { to: true, cc: true, author: true } }
                },
                orderBy: { createdAt: 'desc' }
            });

            // Helper to check if sender is authorized for this ticket
            const isAuthorizedSender = (t, sender) => {
                if (!sender) return true; // If no sender provided, fallback to circuit/subject matching
                const cleanSender = sender.toLowerCase().trim();
                if (cleanSender.includes('edgestone.in')) return true; // Agent/system is always authorized
                if (t.email && t.email.toLowerCase() === cleanSender) return true;
                if (Array.isArray(t.cc) && t.cc.some(c => c.toLowerCase() === cleanSender)) return true;
                if (t.client && Array.isArray(t.client.emails) && t.client.emails.some(e => e.toLowerCase() === cleanSender)) return true;
                if (t.vendor && Array.isArray(t.vendor.emails) && t.vendor.emails.some(e => e.toLowerCase() === cleanSender)) return true;
                
                // Check if sender was added as a recipient or author in any prior replies on this ticket
                if (Array.isArray(t.replies)) {
                    const isParticipantInReplies = t.replies.some(r => {
                        if (r.author && r.author.toLowerCase().includes(cleanSender)) return true;
                        if (Array.isArray(r.to) && r.to.some(toEmail => toEmail.toLowerCase().trim() === cleanSender)) return true;
                        if (Array.isArray(r.cc) && r.cc.some(ccEmail => ccEmail.toLowerCase().trim() === cleanSender)) return true;
                        return false;
                    });
                    if (isParticipantInReplies) return true;
                }

                // Check corporate domain match with client
                if (t.client && Array.isArray(t.client.emails) && cleanSender.includes('@')) {
                    const senderDomain = cleanSender.split('@')[1];
                    const genericDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
                    if (!genericDomains.includes(senderDomain)) {
                        if (t.client.emails.some(e => e.toLowerCase().endsWith('@' + senderDomain))) {
                            return true;
                        }
                    }
                }
                return false;
            };

            let match = null;
            if (detectedCircuitId) {
                // If a circuit was detected, ONLY match tickets on THAT specific circuit!
                match = allTickets.find(t =>
                    t.circuitId === detectedCircuitId &&
                    t.header && t.header.replace(/^(Re|Fwd|FW|RE|FWD):\s*/gi, '').trim().toLowerCase() === stripped.toLowerCase() &&
                    isAuthorizedSender(t, from)
                );
                if (match) {
                    logger.info(`🎟️ [TICKET] 🧵 Reply matched via subject + Circuit ID "${detectedCircuitId}": "${stripped}" → Ticket ${match.ticketId}`);
                }
            } else if (from) {
                // If no circuit in reply, match subject ONLY if sender is verified on this ticket
                match = allTickets.find(t =>
                    t.header && t.header.replace(/^(Re|Fwd|FW|RE|FWD):\s*/gi, '').trim().toLowerCase() === stripped.toLowerCase() &&
                    isAuthorizedSender(t, from)
                );
                if (match) {
                    logger.info(`🎟️ [TICKET] 🧵 Reply matched via subject + verified sender (${from}): "${stripped}" → Ticket ${match.ticketId}`);
                }
            }

            if (match) {
                return await TicketModel.findTicketById(match.id);
            }
        }
    }

    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// appendAgentReplyFromOutlook
// Appends an agent's reply email sent directly from an email client (e.g. Outlook)
// to the ticket's conversation thread so it reflects in the system dashboard.
// ─────────────────────────────────────────────────────────────────────────────
const appendAgentReplyFromOutlook = async (ticket, emailData) => {
    const { from, fromName, body, html, date, messageId, to, cc, subject, attachments } = emailData;
    const emailSentDate = date ? new Date(date) : new Date();

    logger.info(`🎟️ [TICKET] 📩 Appending Agent reply from Outlook to existing Ticket ${ticket.ticketId} from ${from}`);

    let replyText = stripHtml(body || html) || '(No Content)';
    replyText = stripQuotedReply(replyText) || replyText;

    const prisma = require('../models/index');

    // Duplicate check 1: by messageId
    if (messageId) {
        const dupMessageId = await prisma.reply.findFirst({
            where: { ticketId: ticket.id, messageId }
        });
        if (dupMessageId) {
            logger.info(`🎟️ [TICKET] Reply already recorded in Ticket ${ticket.ticketId} by messageId: ${messageId}`);
            return dupMessageId;
        }
    }

    // Duplicate check 2: by text match against existing replies
    const existingReplies = await prisma.reply.findMany({
        where: { ticketId: ticket.id }
    });
    const dupText = existingReplies.find(r => {
        const cleanRText = r.text.trim();
        return cleanRText && cleanRText.length > 5 && replyText.includes(cleanRText);
    });
    if (dupText) {
        logger.info(`🎟️ [TICKET] Reply content already exists in Ticket ${ticket.ticketId}. Linking messageId.`);
        if (!dupText.messageId && messageId) {
            await prisma.reply.update({
                where: { id: dupText.id },
                data: { messageId }
            });
        }
        return dupText;
    }

    // Determine category: Vendor thread or Client thread
    let category = 'client';
    const isVendorTag = subject && /\[#?V?\d+-V\]/i.test(subject);
    if (isVendorTag) {
        category = ticket.vendorId ? `vendor_${ticket.vendorId}` : 'vendor';
    } else if (ticket.ticketType === 'Vendor') {
        category = ticket.vendorId ? `vendor_${ticket.vendorId}` : 'vendor';
    } else {
        // Check if recipients contain vendor emails
        try {
            const VendorModel = require('../models/vendor');
            const vendors = await VendorModel.findAllVendors();
            const toRecips = Array.isArray(to) ? to : (to ? [to] : []);
            const matchedVendor = vendors.find(v => v.emails.some(e => toRecips.some(r => r.toLowerCase().trim() === e.toLowerCase().trim())));
            if (matchedVendor) {
                category = `vendor_${matchedVendor.id}`;
            }
        } catch (e) {
            logger.error(`Error checking vendor recipients: ${e.message}`);
        }
    }

    const reply = await TicketModel.addReply(ticket.id, {
        text: replyText,
        time: emailSentDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Kolkata'
        }),
        date: emailSentDate.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata'
        }),
        author: fromName || 'EdgeStone Support',
        type: 'agent',
        category: category,
        to: Array.isArray(to) ? to : (to ? [to] : []),
        cc: Array.isArray(cc) ? cc : (cc ? [cc] : []),
        subject: subject || null,
        messageId: messageId || null,
        attachments: attachments || []
    });

    // Log activity
    const ActivityLogModel = require('../models/activityLog');
    const now = new Date();
    await ActivityLogModel.createActivityLog({
        ticketId: ticket.id,
        action: 'replied',
        description: `${fromName || 'Agent'} replied to the ticket via Outlook email`,
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }),
        date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
        author: fromName || from
    });

    logger.info(`🎟️ [TICKET] ✅ Agent Outlook reply appended to Ticket ${ticket.ticketId}`);

    try {
        const notificationService = require('./notificationService');
        await notificationService.sendNotification({
            type: 'agent_reply',
            title: 'Ticket Update (Outlook Reply)',
            message: `${fromName || 'Agent'} replied to Ticket ${ticket.ticketId} via Outlook`,
            ticketId: ticket.ticketId,
            sender: 'agent'
        });
    } catch(err) {
        logger.error(`Notification Error: ${err.message}`);
    }

    return reply;
};

// ─────────────────────────────────────────────────────────────────────────────
// appendClientReplyToTicket
// Appends a client's reply email to an existing ticket's conversation thread.
// Does NOT send another auto-reply (client already has the ticket open).
// ─────────────────────────────────────────────────────────────────────────────
const appendClientReplyToTicket = async (ticket, emailData) => {
    const { from, fromName, body, html, date } = emailData;
    const emailReceivedDate = date ? new Date(date) : new Date();

    logger.info(`🎟️ [TICKET] 📩 Appending client reply to existing Ticket ${ticket.ticketId} from ${from}`);

    let replyText = stripHtml(body || html) || '(No Content)';
    replyText = stripQuotedReply(replyText) || replyText; // fallback if stripping removes everything somehow

    const toList = [from];
    if (Array.isArray(emailData.to)) {
        emailData.to.forEach(e => {
            const clean = e && e.trim().toLowerCase();
            if (clean && clean !== from.toLowerCase() && !toList.some(x => x.toLowerCase() === clean)) {
                toList.push(e.trim());
            }
        });
    }

    const reply = await TicketModel.addReply(ticket.id, {
        text: replyText,
        time: emailReceivedDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }),
        date: emailReceivedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        author: fromName || from,
        type: 'client',
        category: 'client',
        to: toList,
        cc: emailData.cc || [],
        subject: emailData.subject || null,
        messageId: emailData.messageId || null,
        attachments: emailData.attachments || []
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

    // Update ticket.cc if incoming email has CCs/TOs or comes from a new participant
    try {
        const prisma = require('../models/index');
        const existingCcs = Array.isArray(ticket.cc) ? ticket.cc : [];
        const incomingCcs = Array.isArray(emailData.cc) ? emailData.cc : [];
        const incomingTos = (Array.isArray(emailData.to) ? emailData.to : []).filter(e => {
            const clean = e && e.toLowerCase().trim();
            return clean && !clean.includes('edgestone.in') && clean !== ticket.email?.toLowerCase();
        });
        const newParticipants = [...existingCcs, ...incomingCcs, ...incomingTos];
        if (from && from.toLowerCase() !== ticket.email?.toLowerCase() && !from.toLowerCase().includes('edgestone.in')) {
            newParticipants.push(from);
        }
        const mergedCcs = Array.from(new Set(newParticipants.map(e => e.trim().toLowerCase()))).filter(e => e && e !== ticket.email?.toLowerCase());
        
        const existingSet = new Set(existingCcs.map(e => e.trim().toLowerCase()));
        const hasChanged = mergedCcs.length !== existingCcs.length || mergedCcs.some(e => !existingSet.has(e));

        if (hasChanged) {
            await prisma.ticket.update({
                where: { id: ticket.id },
                data: { cc: { set: mergedCcs } }
            });
            ticket.cc = mergedCcs; // Ensure in-memory ticket object is updated
            logger.info(`🎟️ [TICKET] 👥 Updated ticket CC list for Ticket ${ticket.ticketId}: ${mergedCcs.join(', ')}`);
        }

        // Auto-register new client email contacts into Client database
        // STRICT ISOLATION: Prevent adding vendors or contacts of other clients
        if (ticket.clientId) {
            const client = await prisma.client.findUnique({ where: { id: ticket.clientId } });
            if (client) {
                const currentEmails = Array.isArray(client.emails) ? client.emails : [];
                const newEmailsToAdd = [];
                const candidates = [from, ...incomingCcs, ...incomingTos];

                // Load all vendors and other clients to block foreign email pollution
                const VendorModel = require('../models/vendor');
                const allVendors = await VendorModel.findAllVendors();
                const allVendorEmails = new Set(allVendors.flatMap(v => (v.emails || []).map(e => e.toLowerCase().trim())));

                const ClientModel = require('../models/client');
                const allOtherClients = (await ClientModel.findAllClients()).filter(c => c.id !== ticket.clientId);
                const allOtherClientEmails = new Set(allOtherClients.flatMap(c => (c.emails || []).map(e => e.toLowerCase().trim())));

                candidates.forEach(email => {
                    const clean = email && email.trim().toLowerCase();
                    if (clean && !clean.includes('edgestone.in') && !allVendorEmails.has(clean) && !allOtherClientEmails.has(clean)) {
                        if (!currentEmails.some(e => e.toLowerCase() === clean) && !newEmailsToAdd.some(e => e.toLowerCase() === clean)) {
                            newEmailsToAdd.push(email.trim());
                        }
                    }
                });
                if (newEmailsToAdd.length > 0) {
                    await prisma.client.update({
                        where: { id: ticket.clientId },
                        data: { emails: [...currentEmails, ...newEmailsToAdd] }
                    });
                    logger.info(`👤 [CLIENT] ➕ Auto-registered new client contact emails for ${client.name}: ${newEmailsToAdd.join(', ')}`);
                }
            }
        }
    } catch (ccErr) {
        logger.error(`Failed to update ticket.cc / client.emails in appendClientReplyToTicket: ${ccErr.message}`);
    }

    logger.info(`🎟️ [TICKET] ✅ Client reply appended to Ticket ${ticket.ticketId}`);
    try {
        const notificationService = require('./notificationService');
        const isClosed = ticket.status && ticket.status.toLowerCase() === 'closed';
        const senderLabel = ticket.ticketType === 'Vendor' ? 'Vendor' : 'Client';
        const senderName = fromName || from;

        if (isClosed) {
            await notificationService.sendNotification({
                type: 'closed_ticket_reply',
                title: `Closed Ticket Reply (${senderLabel})`,
                message: `${senderLabel} (${senderName}) replied to closed Ticket ${ticket.ticketId}. Please review and reopen if needed.`,
                ticketId: ticket.ticketId,
                sender: 'client'
            });
        } else {
            await notificationService.sendNotification({
                type: 'client_reply',
                title: 'Ticket Update',
                message: `${senderLabel} (${senderName}) replied to Ticket ${ticket.ticketId}`,
                ticketId: ticket.ticketId,
                sender: 'client'
            });
        }
    } catch(err) { logger.error(`Notification Error: ${err.message}`) }
    return reply;
};

// ─────────────────────────────────────────────────────────────────────────────
// appendVendorReplyToTicket
// Appends a vendor's reply email to an existing ticket's vendor thread.
// ─────────────────────────────────────────────────────────────────────────────
const appendVendorReplyToTicket = async (ticket, emailData, vendorId = null, isMultiVendor = false) => {
    const { from, fromName, body, html, date } = emailData;
    const emailReceivedDate = date ? new Date(date) : new Date();

    logger.info(`📝 [TICKET] 📥 Appending vendor reply to existing Ticket ${ticket.ticketId} from ${from}`);

    let replyText = stripHtml(body || html) || '(No Content)';
    replyText = stripQuotedReply(replyText) || replyText;

    const toList = [from];
    if (Array.isArray(emailData.to)) {
        emailData.to.forEach(e => {
            const clean = e && e.trim().toLowerCase();
            if (clean && clean !== from.toLowerCase() && !toList.some(x => x.toLowerCase() === clean)) {
                toList.push(e.trim());
            }
        });
    }

    const reply = await TicketModel.addReply(ticket.id, {
        text: replyText,
        time: emailReceivedDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }),
        date: emailReceivedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        author: fromName || from,
        type: 'vendor',
        category: (vendorId && isMultiVendor) ? `vendor_${vendorId}` : 'vendor',
        to: toList,
        cc: emailData.cc || [],
        subject: emailData.subject || null,
        messageId: emailData.messageId || null,
        attachments: emailData.attachments || []
    });

    // Auto-register new vendor email contacts into Vendor database
    if (vendorId) {
        try {
            const prisma = require('../models/index');
            const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
            if (vendor) {
                const currentEmails = Array.isArray(vendor.emails) ? vendor.emails : [];
                const clientCcs = Array.isArray(ticket.cc) ? ticket.cc.map(c => c.toLowerCase().trim()) : [];
                const clientEmail = ticket.email ? ticket.email.toLowerCase().trim() : null;
                const newEmailsToAdd = [];

                const candidates = [from, ...(emailData.to || []), ...(emailData.cc || [])];
                candidates.forEach(email => {
                    const clean = email && email.trim().toLowerCase();
                    if (clean && !clean.includes('edgestone.in') && clean !== clientEmail && !clientCcs.includes(clean)) {
                        if (!currentEmails.some(e => e.toLowerCase() === clean) && !newEmailsToAdd.some(e => e.toLowerCase() === clean)) {
                            newEmailsToAdd.push(email.trim());
                        }
                    }
                });

                if (newEmailsToAdd.length > 0) {
                    await prisma.vendor.update({
                        where: { id: vendorId },
                        data: { emails: [...currentEmails, ...newEmailsToAdd] }
                    });
                    logger.info(`🏢 [VENDOR] ➕ Auto-registered new vendor contact emails for ${vendor.name}: ${newEmailsToAdd.join(', ')}`);
                }
            }
        } catch (vErr) {
            logger.error(`Failed to update vendor.emails in appendVendorReplyToTicket: ${vErr.message}`);
        }
    }

    // Log activity
    const ActivityLogModel = require('../models/activityLog');
    const now = new Date();
    await ActivityLogModel.createActivityLog({
        ticketId: ticket.id,
        action: 'vendor_replied',
        description: `Vendor ${fromName || from} replied to the ticket via email`,
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        author: fromName || from,
    });

    logger.info(`🎟️ [TICKET] ✅ Vendor reply appended to Ticket ${ticket.ticketId}`);
    try {
        const notificationService = require('./notificationService');
        const isClosed = ticket.status && ticket.status.toLowerCase() === 'closed';
        const senderName = fromName || from;

        if (isClosed) {
            await notificationService.sendNotification({
                type: 'closed_ticket_reply',
                title: 'Closed Ticket Reply (Vendor)',
                message: `Vendor (${senderName}) replied to closed Ticket ${ticket.ticketId}. Please review and reopen if needed.`,
                ticketId: ticket.ticketId,
                sender: 'vendor'
            });
        } else {
            await notificationService.sendNotification({
                type: 'vendor_reply',
                title: 'Ticket Update',
                message: `Vendor (${senderName}) replied to Ticket ${ticket.ticketId}`,
                ticketId: ticket.ticketId,
                sender: 'vendor'
            });
        }
    } catch(err) { logger.error(`Notification Error: ${err.message}`) }

    // --- AUTOMATIC SLA START ON FIRST VENDOR REPLY ---
    try {
        const prisma = require('../models/index');
        const existingVendorSla = await prisma.sLARecord.findFirst({
            where: { ticketId: ticket.id, type: 'VENDOR' }
        });

        if (!existingVendorSla) {
            const slaStart = new Date();
            await prisma.sLARecord.create({
                data: {
                    ticketId: ticket.id,
                    type: 'VENDOR',
                    startDate: slaStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
                    startTime: slaStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).replace(/^24:/, '00:'),
                    status: 'Safe',
                    compensation: '-',
                    statusReason: 'Vendor SLA started on first vendor reply'
                }
            });
            logger.info(`⏱️ [SLA] ✨ Vendor SLA clock started for Ticket ${ticket.ticketId}`);
        }
    } catch (slaErr) {
        logger.warn(`⚠️ ⏱️ [SLA] ⚠️ Failed to start Vendor SLA: ${slaErr.message}`);
    }    return reply;
};

const createTicketFromEmail = async (emailData) => {
    const { from, fromName, subject, body, date, messageId, inReplyTo, references } = emailData;

    logger.debug(`📝 [TICKET] 📥 Processing incoming email from: ${from} | Subject: ${subject}`);

    try {
        const prisma = require('../models/index');
        
        // --- DUPLICATE PREVENTION ---
        if (messageId) {
            // Check if a Ticket with this incoming messageId already exists
            const duplicateTicket = await prisma.ticket.findFirst({ where: { messageId } });
            if (duplicateTicket) {
                logger.warn(`🚨 [TICKET] Duplicate email detected. Ticket already exists for messageId: ${messageId}. Skipping.`);
                return duplicateTicket;
            }

            // Check if a Reply with this incoming messageId already exists
            const duplicateReply = await prisma.reply.findFirst({ where: { messageId } });
            if (duplicateReply) {
                logger.warn(`🚨 [TICKET] Duplicate email detected. Reply already exists for messageId: ${messageId}. Skipping.`);
                return duplicateReply;
            }
        }

        // 0. Check if this email is a reply to an existing ticket
        const existingTicket = await findExistingTicketForReply(inReplyTo, references, subject, body, from);
        if (existingTicket) {
            if (existingTicket.clientId && !existingTicket.client) {
                try {
                    const prisma = require('../models/index');
                    existingTicket.client = await prisma.client.findUnique({ where: { id: existingTicket.clientId } });
                } catch (_) {}
            }

            // Determine if the sender is a known Vendor (case-insensitive)
            const VendorModel = require('../models/vendor');
            const vendors = await VendorModel.findAllVendors();
            let matchedVendors = vendors.filter(v => v.emails.some(e => e.toLowerCase() === from.toLowerCase()));
            let isVendor = matchedVendors.length > 0;
            let finalVendorId = null;

            if (isVendor) {
                // Determine the best vendor match if multiple vendors share the same email
                const prisma = require('../models/index');
                let circuitVendors = [];
                if (existingTicket.vendorId) {
                    circuitVendors.push(existingTicket.vendorId);
                }
                
                if (existingTicket.circuitId) {
                    try {
                        const circuit = await prisma.circuit.findFirst({
                            where: { OR: [ { customerCircuitId: existingTicket.circuitId }, { supplierCircuitId: existingTicket.circuitId }, { id: existingTicket.circuitId } ] },
                            include: { vendorCircuits: true }
                        });
                        if (circuit) {
                            if (circuit.vendorId) circuitVendors.push(circuit.vendorId);
                            if (circuit.vendorCircuits && circuit.vendorCircuits.length > 0) {
                                circuitVendors.push(...circuit.vendorCircuits.map(vc => vc.vendorId).filter(id => id));
                            }
                        }
                    } catch (err) {
                        logger.error(`Error finding circuit for vendor prioritization: ${err.message}`);
                    }
                }

                const prioritizedVendor = matchedVendors.find(v => circuitVendors.includes(v.id));
                finalVendorId = prioritizedVendor ? prioritizedVendor.id : matchedVendors[0].id;

                // ── SMART VENDOR ACTIVE TICKET DISAMBIGUATION ──
                // When vendors reply via email, they often reply to an existing email thread in their email client
                // which might contain an older ticket tag (e.g., [#V1018]). Since vendors are NEVER sent
                // automated emails, if there is a newer active maintenance/open ticket for the same circuit and vendor,
                // we intelligently route the vendor's reply to that active ticket (e.g., #V1023).
                if (existingTicket.circuitId) {
                    try {
                        const newerActiveTicket = await prisma.ticket.findFirst({
                            where: {
                                circuitId: existingTicket.circuitId,
                                id: { not: existingTicket.id },
                                createdAt: { gt: existingTicket.createdAt },
                                OR: [
                                    { isMaintenance: true },
                                    { status: { in: ['Maintenance', 'Open', 'In Progress'] } }
                                ]
                            },
                            orderBy: { createdAt: 'desc' }
                        });

                        if (newerActiveTicket) {
                            logger.info(`🎟️ [TICKET] 🔀 Disambiguated vendor reply: Redirected from older Ticket ${existingTicket.ticketId} to newer active Ticket ${newerActiveTicket.ticketId} on circuit ${existingTicket.circuitId}`);
                            existingTicket = newerActiveTicket;
                        }
                    } catch (disErr) {
                        logger.error(`Error in vendor ticket disambiguation: ${disErr.message}`);
                    }
                }
            }

            // If the matched parent reply was in the vendor thread, force vendor routing
            if (existingTicket._matchedReply && (existingTicket._matchedReply.category === 'vendor' || existingTicket._matchedReply.category?.startsWith('vendor_') || existingTicket._matchedReply.type === 'vendor')) {
                logger.info(`🎟️ [TICKET] 🧵 Force-routing reply into Vendor thread due to parent reply in vendor thread`);
                isVendor = true;
                if (!finalVendorId && existingTicket._matchedReply.category?.startsWith('vendor_')) {
                    finalVendorId = existingTicket._matchedReply.category.replace('vendor_', '');
                }
            } else if (existingTicket._matchedReply && (existingTicket._matchedReply.type === 'client' || (existingTicket._matchedReply.type === 'agent' && (!existingTicket._matchedReply.category || existingTicket._matchedReply.category === 'client')))) {
                logger.info(`🎟️ [TICKET] 🧵 Force-routing reply into Client thread due to parent reply in client thread`);
                isVendor = false;
                finalVendorId = null;
            }

            // Check if sender was added as a participant in previous replies of this ticket
            let previousReplies = [];
            try {
                const prisma = require('../models/index');
                previousReplies = await prisma.reply.findMany({
                    where: { ticketId: existingTicket.id },
                    orderBy: { createdAt: 'desc' }
                });
            } catch (rErr) {
                logger.error(`Error loading previous replies for ticket ${existingTicket.ticketId}: ${rErr.message}`);
            }

            if (!isVendor) {
                const cleanFrom = from.trim().toLowerCase();
                try {
                    // 1. Was sender in TO or CC of any previous Vendor reply?
                    for (const r of previousReplies) {
                        const isVendorRep = r.category === 'vendor' || r.category?.startsWith('vendor_') || r.type === 'vendor';
                        if (isVendorRep) {
                            const participants = [
                                ...(Array.isArray(r.to) ? r.to : []),
                                ...(Array.isArray(r.cc) ? r.cc : [])
                            ].map(e => e.toLowerCase().trim());

                            if (participants.includes(cleanFrom)) {
                                isVendor = true;
                                if (r.category?.startsWith('vendor_')) {
                                    finalVendorId = r.category.replace('vendor_', '');
                                } else if (existingTicket.vendorId) {
                                    finalVendorId = existingTicket.vendorId;
                                }
                                logger.info(`🎟️ [TICKET] 🎯 Identified ${from} as VENDOR based on prior vendor reply participant in category ${r.category}`);
                                break;
                            }
                        }
                    }

                    // 2. Check if subject has vendor tag e.g. [#1024-V] or [1024-V]
                    if (!isVendor && subject && /\[#?V?\d+-V\]/i.test(subject)) {
                        isVendor = true;
                        logger.info(`🎟️ [TICKET] 🧵 Force-routing reply into Vendor thread due to -V tag in subject`);
                    }

                    // 3. Check if email mentions supplier circuit ID of any vendor on this circuit
                    if (!isVendor && existingTicket.circuitId) {
                        const prisma = require('../models/index');
                        const circuit = await prisma.circuit.findFirst({
                            where: { OR: [ { customerCircuitId: existingTicket.circuitId }, { supplierCircuitId: existingTicket.circuitId }, { id: existingTicket.circuitId } ] },
                            include: { vendorCircuits: true }
                        });
                        if (circuit) {
                            const textScan = `${subject || ''} ${body || ''}`.toUpperCase();
                            if (circuit.isMultiVendor && circuit.vendorCircuits && circuit.vendorCircuits.length > 0) {
                                const matchedVc = circuit.vendorCircuits.find(vc => 
                                    vc.supplierCircuitId && textScan.includes(vc.supplierCircuitId.toUpperCase())
                                );
                                if (matchedVc) {
                                    isVendor = true;
                                    finalVendorId = matchedVc.vendorId;
                                    logger.info(`🎟️ [TICKET] 🎯 Identified ${from} as VENDOR for multi-vendor circuit based on Supplier Circuit ID ${matchedVc.supplierCircuitId}`);
                                }
                            } else if (circuit.supplierCircuitId && textScan.includes(circuit.supplierCircuitId.toUpperCase())) {
                                isVendor = true;
                                finalVendorId = circuit.vendorId;
                                logger.info(`🎟️ [TICKET] 🎯 Identified ${from} as VENDOR based on Supplier Circuit ID ${circuit.supplierCircuitId}`);
                            }
                        }
                    }

                    // 4. Corporate Domain match: If sender's domain matches any vendor associated with this circuit
                    if (!isVendor && cleanFrom.includes('@')) {
                        const fromDomain = cleanFrom.split('@')[1];
                        const genericDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
                        if (!genericDomains.includes(fromDomain)) {
                            for (const v of vendors) {
                                if (Array.isArray(v.emails) && v.emails.some(e => e.toLowerCase().endsWith('@' + fromDomain))) {
                                    isVendor = true;
                                    finalVendorId = v.id;
                                    logger.info(`🎟️ [TICKET] 🎯 Identified ${from} as VENDOR based on domain @${fromDomain} matching vendor ${v.name}`);
                                    break;
                                }
                            }
                        }
                    }
                } catch (pErr) {
                    logger.error(`Error in participant reply inspection: ${pErr.message}`);
                }
            }

            // PREVENT FALSE POSITIVE: If the sender is the original ticket-raiser, is on ticket CC,
            // is a recognized contact of the client who owns the ticket, was in TO/CC of previous client replies,
            // or if the email's recipients include the ticket creator, AND subject is not marked as vendor (-V),
            // route to client thread.
            const isExplicitVendor = subject && /\[#?V?\d+-V\]/i.test(subject);
            const cleanSenderFrom = from ? from.trim().toLowerCase() : '';
            const incomingRecipients = [...(emailData.to || []), ...(emailData.cc || [])].map(e => e.toLowerCase().trim());
            const includesTicketOwner = existingTicket.email && incomingRecipients.includes(existingTicket.email.toLowerCase().trim());

            const isClientSender = (existingTicket.email && existingTicket.email.toLowerCase() === cleanSenderFrom) ||
                (Array.isArray(existingTicket.cc) && existingTicket.cc.some(c => c.toLowerCase() === cleanSenderFrom)) ||
                (existingTicket.client && Array.isArray(existingTicket.client.emails) && existingTicket.client.emails.some(e => e.toLowerCase() === cleanSenderFrom)) ||
                (Array.isArray(previousReplies) && previousReplies.some(r => {
                    const isClientReply = r.category === 'client' || (!r.category && r.type !== 'vendor');
                    if (isClientReply) {
                        const recips = [...(r.to || []), ...(r.cc || [])].map(e => e.toLowerCase().trim());
                        return recips.includes(cleanSenderFrom);
                    }
                    return false;
                })) ||
                (includesTicketOwner && !isExplicitVendor);

            if (!isExplicitVendor && isClientSender) {
                isVendor = false;
                finalVendorId = null;
                logger.info(`🎟️ [TICKET] 🎯 Sender ${from} is client/participant on Ticket ${existingTicket.ticketId} without vendor tag. Routing to Client thread.`);
            }

            // EXPLICIT ROUTING: If the subject contains the explicit vendor suffix
            if (isExplicitVendor) {
                isVendor = true;
                if (!finalVendorId) finalVendorId = existingTicket.vendorId;
            }

            let isCircuitMultiVendor = false;
            if (isVendor && !finalVendorId) {
                finalVendorId = existingTicket.vendorId;
                if (existingTicket.circuitId) {
                    try {
                        const prisma = require('../models/index');
                        const circuit = await prisma.circuit.findFirst({
                            where: { OR: [ { customerCircuitId: existingTicket.circuitId }, { supplierCircuitId: existingTicket.circuitId }, { id: existingTicket.circuitId } ] },
                            include: { vendorCircuits: { include: { vendor: true } } }
                        });
                        if (circuit) {
                            isCircuitMultiVendor = !!circuit.isMultiVendor;
                            if (circuit.isMultiVendor && circuit.vendorCircuits && circuit.vendorCircuits.length > 0) {
                                const textScan = `${subject || ''} ${body || ''}`.toUpperCase();
                                const vcMatch = circuit.vendorCircuits.find(vc => 
                                    (vc.vendor?.emails && vc.vendor.emails.some(e => e.toLowerCase() === from.toLowerCase())) ||
                                    (vc.supplierCircuitId && textScan.includes(vc.supplierCircuitId.toUpperCase()))
                                );
                                if (vcMatch && vcMatch.vendorId) {
                                    finalVendorId = vcMatch.vendorId;
                                } else {
                                    // If no specific vendor matched yet, find which vendor thread has the latest reply
                                    const lastVendorRep = await prisma.reply.findFirst({
                                        where: { ticketId: existingTicket.id, category: { startsWith: 'vendor_' } },
                                        orderBy: { createdAt: 'desc' }
                                    });
                                    if (lastVendorRep && lastVendorRep.category?.startsWith('vendor_')) {
                                        finalVendorId = lastVendorRep.category.replace('vendor_', '');
                                    } else {
                                        finalVendorId = circuit.vendorCircuits[0].vendorId;
                                    }
                                }
                            }
                            if (!finalVendorId) finalVendorId = circuit.vendorId;
                        }
                    } catch (vErr) {
                        logger.error(`Error finding circuit vendorId: ${vErr.message}`);
                    }
                }
            }

            if (isVendor) {
                return await appendVendorReplyToTicket(existingTicket, emailData, finalVendorId, isCircuitMultiVendor);
            } else {
                return await appendClientReplyToTicket(existingTicket, emailData);
            }
        }

        // 1. Identify Potential Senders
        let potentialClientIds = [];
        let potentialVendorIds = [];
        let clientId = null;
        let vendorId = null;
        let ticketType = 'Client';

        const ClientModel = require('../models/client');
        const clients = await ClientModel.findAllClients();
        potentialClientIds = clients.filter(c => c.emails.some(e => e.toLowerCase() === from.toLowerCase())).map(c => c.id);

        const VendorModel = require('../models/vendor');
        const vendors = await VendorModel.findAllVendors();
        potentialVendorIds = vendors.filter(v => v.emails.some(e => e.toLowerCase() === from.toLowerCase())).map(v => v.id);

        // Set initial defaults (first match wins, will be disambiguated by circuit later if needed)
        if (potentialClientIds.length > 0) {
            clientId = potentialClientIds[0];
            logger.debug(`🐞 🎟️ [TICKET] 👤 Initially identified sender as Client: ${clientId}`);
        } else if (potentialVendorIds.length > 0) {
            vendorId = potentialVendorIds[0];
            ticketType = 'Vendor';
            logger.debug(`🐞 🎟️ [TICKET] 🏢 Initially identified sender as Vendor: ${vendorId}`);
        } else {
            logger.debug(`🐞 🎟️ [TICKET] ❓ Sender not identified as existing client or vendor.`);
        }

        // 2. Parse Subject and Body for Circuit ID from Database via AI + Regex Fallback
        let circuitId = null;
        let circuitUUID = null;
        let foundLocation = 'none';
        let containsVendorCircuitId = false;
        try {
            // Fetch circuits including supplier IDs, clientId and vendorId for disambiguation
            const allCircuits = await prisma.circuit.findMany({ 
                select: { id: true, customerCircuitId: true, supplierCircuitId: true, clientId: true, vendorId: true, isMultiVendor: true, vendorCircuits: true } 
            });
            
            // Helper to check for whole word / token boundary match (prevents substring collision)
            const matchesCircuit = (text, targetId) => {
                if (!text || !targetId) return false;
                const escaped = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(?:^|[^a-zA-Z0-9_-])${escaped}(?:$|[^a-zA-Z0-9_-])`, 'i');
                return regex.test(text);
            };

            const subjectText = subject || '';
            const bodyText = body || '';
            const cleanBodyText = stripQuotedReply(stripHtml(bodyText)) || bodyText;
            const subjectUpper = subjectText.toUpperCase();
            const bodyUpper = bodyText.toUpperCase();

            // CHG-016: Client-Centric Prioritization & Strict Client-Circuit Isolation
            // When an identified client contacts us, ONLY search circuits owned by that client.
            // Never allow an identified client to match or raise tickets against another client's circuits!
            let priorityCircuits = [];
            let secondaryCircuits = [];

            if (potentialClientIds.length > 0) {
                priorityCircuits = allCircuits.filter(c => c.clientId && potentialClientIds.includes(c.clientId));
                secondaryCircuits = []; // STRICT ISOLATION: Never match foreign client circuits!
            } else if (potentialVendorIds.length > 0) {
                priorityCircuits = allCircuits.filter(c => 
                    (c.vendorId && potentialVendorIds.includes(c.vendorId)) ||
                    (c.isMultiVendor && c.vendorCircuits && c.vendorCircuits.some(vc => potentialVendorIds.includes(vc.vendorId)))
                );
                secondaryCircuits = []; // STRICT ISOLATION: Never match foreign vendor circuits!
            } else {
                // Unregistered sender or internal employee forwarding: search all circuits
                priorityCircuits = allCircuits;
                secondaryCircuits = [];
            }

            const findMatchInPool = (circuitPool) => {
                const poolIds = [];
                circuitPool.forEach(c => {
                    if (c.customerCircuitId) poolIds.push({ id: c.customerCircuitId, circuit: c, isSupplier: false });
                    if (c.supplierCircuitId) poolIds.push({ id: c.supplierCircuitId, circuit: c, isSupplier: true });
                    if (c.isMultiVendor && Array.isArray(c.vendorCircuits)) {
                        c.vendorCircuits.forEach(vc => {
                            if (vc.supplierCircuitId) {
                                poolIds.push({ id: vc.supplierCircuitId, circuit: c, isSupplier: true });
                            }
                        });
                    }
                });
                poolIds.sort((a, b) => b.id.length - a.id.length);

                // 1. Scan subject first (explicit)
                for (const item of poolIds) {
                    if (matchesCircuit(subjectText, item.id)) {
                        return { circuit: item.circuit, isSupplier: item.isSupplier, location: 'subject', matchedId: item.id };
                    }
                }
                // 2. Scan fresh body (quoted conversation history stripped)
                for (const item of poolIds) {
                    if (matchesCircuit(cleanBodyText, item.id)) {
                        return { circuit: item.circuit, isSupplier: item.isSupplier, location: 'body', matchedId: item.id };
                    }
                }
                // 3. Scan full body (fallback if not in clean body)
                if (cleanBodyText !== bodyText) {
                    for (const item of poolIds) {
                        if (matchesCircuit(bodyText, item.id)) {
                            return { circuit: item.circuit, isSupplier: item.isSupplier, location: 'body_quoted', matchedId: item.id };
                        }
                    }
                }
                return null;
            };

            // Search circuits (restricted to sender's own circuits when sender is an identified client)
            let matchResult = findMatchInPool(priorityCircuits);

            if (!matchResult && secondaryCircuits.length > 0) {
                matchResult = findMatchInPool(secondaryCircuits);
            }

            if (matchResult) {
                circuitId = matchResult.circuit.customerCircuitId;
                circuitUUID = matchResult.circuit.id;
                foundLocation = matchResult.location;
                if (matchResult.isSupplier) {
                    containsVendorCircuitId = true;
                }
                logger.info(`🎟️ [TICKET] 🔍 Circuit Match: Detected Circuit ID "${matchResult.matchedId}" in ${matchResult.location.toUpperCase()} for Client ${matchResult.circuit.clientId || 'Unknown'}`);
            } else {
                logger.info(`🎟️ [TICKET] Circuit scan found no recognized Circuit ID in subject or body.`);
            }

            // --- Disambiguate Sender based on detected circuit ---
            if (circuitId) {
                const detectedCircuitRecord = allCircuits.find(c => c.customerCircuitId === circuitId || c.supplierCircuitId === circuitId);
                if (detectedCircuitRecord) {
                    let matchedCircuitVendorId = null;

                    if (detectedCircuitRecord.supplierCircuitId) {
                        const suppIdUpper = detectedCircuitRecord.supplierCircuitId.toUpperCase();
                        if (subjectUpper.includes(suppIdUpper) || bodyUpper.includes(suppIdUpper)) {
                            containsVendorCircuitId = true;
                            logger.info(`🎟️ [TICKET] Vendor circuit ID detected during disambiguation phase.`);
                        }
                    }

                    if (detectedCircuitRecord.isMultiVendor && detectedCircuitRecord.vendorCircuits && detectedCircuitRecord.vendorCircuits.length > 0) {
                        // For multi-vendor, check if sender matches any of the vendorCircuits' vendors
                        const matchingVendorCircuit = detectedCircuitRecord.vendorCircuits.find(vc => vc.vendorId && potentialVendorIds.includes(vc.vendorId));
                        if (matchingVendorCircuit) {
                            matchedCircuitVendorId = matchingVendorCircuit.vendorId;
                        }
                    } else if (detectedCircuitRecord.vendorId && potentialVendorIds.includes(detectedCircuitRecord.vendorId)) {
                        // Standard single vendor check
                        matchedCircuitVendorId = detectedCircuitRecord.vendorId;
                    }

                    const isExplicitVendor = (matchResult && matchResult.isSupplier) || (subject && /\[#?V?\d+-V\]/i.test(subject));

                    // 1. If NOT explicitly a vendor communication, and the sender is a recognized client for this circuit:
                    // Priority belongs to Client! (prevents client ticket using customer circuit ID from being hijacked as vendor ticket)
                    if (!isExplicitVendor && detectedCircuitRecord.clientId && potentialClientIds.includes(detectedCircuitRecord.clientId)) {
                        clientId = detectedCircuitRecord.clientId;
                        ticketType = 'Client';
                        vendorId = null;
                        logger.info(`🎟️ [TICKET] 🎯 Disambiguated Sender: Assigned to Client ${clientId} based on Circuit ${circuitId} (Sender is recognized client)`);
                    }
                    // 2. If explicitly vendor OR sender is ONLY a vendor (not a client):
                    else if (matchedCircuitVendorId && (isExplicitVendor || potentialClientIds.length === 0)) {
                        vendorId = matchedCircuitVendorId;
                        ticketType = 'Vendor';
                        clientId = null;
                        logger.info(`🎟️ [TICKET] 🎯 Disambiguated Sender: Assigned to Vendor ${vendorId} based on Circuit ${circuitId}`);
                    }
                    // 3. If matchedCircuitVendorId exists and sender is not recognized as the client for this circuit:
                    else if (matchedCircuitVendorId && (!detectedCircuitRecord.clientId || !potentialClientIds.includes(detectedCircuitRecord.clientId))) {
                        vendorId = matchedCircuitVendorId;
                        ticketType = 'Vendor';
                        clientId = null;
                        logger.info(`🎟️ [TICKET] 🎯 Disambiguated Sender: Assigned to Vendor ${vendorId} based on Circuit ${circuitId} (Vendor matched)`);
                    }
                    // 4. Default to Client who owns the circuit (handles internal employees forwarding client emails or recognized clients):
                    else if (detectedCircuitRecord.clientId) {
                        clientId = detectedCircuitRecord.clientId;
                        ticketType = 'Client';
                        vendorId = null;
                        logger.info(`🎟️ [TICKET] 🎯 Disambiguated Sender: Assigned to Client ${clientId} based on Circuit ${circuitId}`);
                    }
                }
            }

        } catch (dbErr) {
            logger.error(`🚨 🎟️ [TICKET] ❌ Failed to process AI Circuit identification: ${dbErr.message}`);
        }

        // 🛡️ CRITICAL GATE: If no circuit matches the DB, absolutely DO NOT create a ticket!
        if (!circuitId) {
            logger.warn(`⚠️ 🎟️ [TICKET] 🚫 DROPPED EMAIL: Subject "${subject}" from ${from} does not contain any recognized Circuit ID. Ticket will NOT be created.`);
            return null;
        }


        let ticketId;
        let ticket;
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
            ticketId = await generateTicketId(ticketType);
            logger.debug(`🐞 🎟️ [TICKET] 🆔 Generated ${ticketType} Ticket ID: ${ticketId}`);

        // 4. Use REAL email received timestamp, not current time
        logger.info('🎟️ [TICKET] ⏰⏰⏰ PERMAN is fetching time... ⏰⏰⏰');
        logger.debug(`🐞 🎟️ [TICKET] ⏰ Raw Date from Email Parameter: ${date}`);
        const emailReceivedDate = date ? new Date(date) : new Date();
        logger.info(`🎟️ [TICKET] ⏰ PERMAN Calculated Received Date: ${emailReceivedDate.toISOString()}`);
        logger.info(`🎟️ [TICKET] ⏰ PERMAN Formatted Time: ${emailReceivedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`);

        // 5. Create Ticket with real timestamp
        const incomingTos = (Array.isArray(emailData.to) ? emailData.to : []).filter(e => {
            const clean = e && e.toLowerCase().trim();
            return clean && !clean.includes('edgestone.in') && clean !== from.toLowerCase();
        });
        const initialCcs = Array.from(new Set([
            ...(Array.isArray(emailData.cc) ? emailData.cc : []),
            ...incomingTos
        ].map(e => e.trim().toLowerCase()))).filter(e => e && e !== from.toLowerCase());

        const initialToList = [from];
        if (Array.isArray(emailData.to)) {
            emailData.to.forEach(e => {
                const clean = e && e.trim().toLowerCase();
                if (clean && clean !== from.toLowerCase() && !initialToList.some(x => x.toLowerCase() === clean)) {
                    initialToList.push(e.trim());
                }
            });
        }

        try {
            ticket = await TicketModel.createTicket({
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
                cc: initialCcs,
                replies: {
                    create: {
                        text: stripQuotedReply(stripHtml(body)) || '(No Content)',
                        time: emailReceivedDate.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }), // FIXED: Use email time, not current time
                        date: emailReceivedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        author: fromName || from,
                        type: ticketType.toLowerCase(),
                        category: (ticketType === 'Vendor' && vendorId) ? `vendor_${vendorId}` : ticketType.toLowerCase(),
                        to: initialToList,
                        cc: emailData.cc || [],
                        subject: subject || 'No Subject',
                        messageId: messageId || null,
                        attachments: emailData.attachments || []
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

            // Auto-register contacts into Client or Vendor model
            if (clientId) {
                try {
                    const client = await prisma.client.findUnique({ where: { id: clientId } });
                    if (client) {
                        const currentEmails = Array.isArray(client.emails) ? client.emails : [];
                        const newEmails = [];
                        [from, ...initialCcs].forEach(em => {
                            const c = em && em.trim().toLowerCase();
                            if (c && !c.includes('edgestone.in') && !currentEmails.some(x => x.toLowerCase() === c) && !newEmails.some(x => x.toLowerCase() === c)) {
                                newEmails.push(em.trim());
                            }
                        });
                        if (newEmails.length > 0) {
                            await prisma.client.update({ where: { id: clientId }, data: { emails: [...currentEmails, ...newEmails] } });
                            logger.info(`👤 [CLIENT] ➕ Auto-registered contact emails for ${client.name}: ${newEmails.join(', ')}`);
                        }
                    }
                } catch (cErr) {
                    logger.error(`Error auto-registering client emails: ${cErr.message}`);
                }
            } else if (vendorId) {
                try {
                    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
                    if (vendor) {
                        const currentEmails = Array.isArray(vendor.emails) ? vendor.emails : [];
                        const newEmails = [];
                        [from, ...initialCcs].forEach(em => {
                            const c = em && em.trim().toLowerCase();
                            if (c && !c.includes('edgestone.in') && !currentEmails.some(x => x.toLowerCase() === c) && !newEmails.some(x => x.toLowerCase() === c)) {
                                newEmails.push(em.trim());
                            }
                        });
                        if (newEmails.length > 0) {
                            await prisma.vendor.update({ where: { id: vendorId }, data: { emails: [...currentEmails, ...newEmails] } });
                            logger.info(`🏢 [VENDOR] ➕ Auto-registered contact emails for ${vendor.name}: ${newEmails.join(', ')}`);
                        }
                    }
                } catch (vErr) {
                    logger.error(`Error auto-registering vendor emails: ${vErr.message}`);
                }
            }

            break; // Success! Exit loop
        } catch (error) {
            if (error.code === 'P2002' && retries < maxRetries - 1) {
                logger.warn(`⚠️ 🎟️ [TICKET] Unique constraint failed on ticketId ${ticketId}, retrying (${retries + 1}/${maxRetries})...`);
                retries++;
                await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100)); // random delay 100-300ms
            } else {
                throw error;
            }
        }
    }


        logger.info(`🎟️ [TICKET] ✅ ${ticketType} Ticket Created Successfully: ${ticket.ticketId} at ${ticket.receivedTime}`);
        try {
            const notificationService = require('./notificationService');
            notificationService.sendNotification({ type: 'new_ticket', message: `New Ticket Raised: ${ticket.ticketId}`, ticketId: ticket.ticketId });
        } catch(err) { logger.error(`Notification Error: ${err.message}`) }

        // Auto-reply logic
        // Skip auto-reply for all vendor-raised tickets (including maintenance)
        if (ticketType !== 'Vendor') {
            try {
                const emailService = require('./emailService');
                const autoReplySubject = `Ticket Received: [${ticket.ticketId}] ${ticket.header}`;
                const autoReplyText = `Dear Customer,\n\nYour ticket has been received and created. Ticket ID: ${ticket.ticketId}\n\nOur team will review your request and get back to you shortly.\n\nThank you,\nSupport Team`;
                const autoReplyHtml = `
                    <div style="font-family: Arial, sans-serif;">
                        <p>Dear Customer,</p>
                        <p>Your ticket has been received and created.</p>
                        <p><strong>Ticket ID:</strong> ${ticket.ticketId}</p>
                        <p>Our team will review your request and get back to you shortly.</p>
                        <br/>
                        <p>Thank you,<br/>Support Team</p>
                    </div>
                `;

                logger.info(`🎟️ [TICKET] 🤖 Sending Auto-Reply to ${from} for Ticket ${ticket.ticketId}`);
                await emailService.sendEmail({
                    to: [from],
                    subject: autoReplySubject,
                    text: autoReplyText,
                    html: autoReplyHtml
                });
            } catch(err) {
                logger.error(`🎟️ [TICKET] ❌ Auto-Reply Error: ${err.message}`);
            }
        } else {
            logger.info(`🎟️ [TICKET] 🛑 Skipped Auto-Reply for Ticket ${ticket.ticketId} (Vendor ticket)`);
        }

        return ticket;

    } catch (error) {
        logger.error(`🚨 🎟️ [TICKET] ❌ Error in createTicketFromEmail: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

const getTickets = async () => {
    logger.debug('🐞 🎟️ [TICKET] 📋 Fetching all tickets...');
    const tickets = await TicketModel.findAllTickets({
        include: {
            replies: {
                orderBy: {
                    createdAt: 'asc'
                }
            },
            client: true,
            vendor: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
    logger.debug(`🐞 🎟️ [TICKET] 🔢 Retrieved ${tickets.length} tickets.`);
    return tickets;
};

const replyToTicket = async (ticketId, message, agentEmail, agentName, htmlContent, attachments, emailOverrides = {}) => {
    logger.info(`🎟️ [TICKET] ↩️ Processing reply to ticket ${ticketId} by ${agentName} (${agentEmail})`);

    try {
        // 1. Find Ticket
        let ticket;
        if (ticketId.startsWith('#')) {
            const prisma = require('../models/index');
            ticket = await prisma.ticket.findFirst({ where: { ticketId: { equals: ticketId, mode: 'insensitive' } } });
        } else {
            ticket = await TicketModel.findTicketById(ticketId);
        }

        if (!ticket) {
            throw new Error(`Ticket not found: ${ticketId}`);
        }

        const recipientEmails = (emailOverrides.to && Array.isArray(emailOverrides.to) && emailOverrides.to.length > 0) ? emailOverrides.to : [ticket.email];
        const emailSubject = emailOverrides.subject || `Re: [${ticket.ticketId}] ${ticket.header}`;
        const rawCc = (emailOverrides.cc && Array.isArray(emailOverrides.cc)) ? emailOverrides.cc : (Array.isArray(ticket.cc) ? ticket.cc : []);
        const toLowerSet = new Set(recipientEmails.map(e => e && e.toLowerCase().trim()));
        const ccEmails = Array.from(new Set(rawCc.map(e => e && e.trim()).filter(Boolean)))
            .filter(e => !toLowerSet.has(e.toLowerCase()));
        const bccEmails = (emailOverrides.bcc && Array.isArray(emailOverrides.bcc)) ? emailOverrides.bcc : [];

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
            category: 'client',
            to: recipientEmails,
            cc: ccEmails,
            bcc: bccEmails,
            subject: emailSubject,
            attachments: attachments || []
        });

        // 2.5 Find all message IDs in the client thread for RFC 5322 In-Reply-To and References chain
        const prisma = require('../models/index');
        const replies = await prisma.reply.findMany({
            where: { ticketId: ticket.id, messageId: { not: null }, category: 'client' },
            orderBy: { createdAt: 'asc' }
        });

        // Build RFC 5322 References chain:
        // root message ID (ticket.messageId if present) + all reply message IDs up to the current one
        const referencesList = [];
        if (ticket.messageId && ticket.messageId.trim()) {
            referencesList.push(ticket.messageId.trim());
        }
        for (const rep of replies) {
            if (rep.messageId && rep.messageId.trim()) {
                const trimmed = rep.messageId.trim();
                if (!referencesList.includes(trimmed)) {
                    referencesList.push(trimmed);
                }
            }
        }

        const threadMessageId = (replies.length > 0 && replies[replies.length - 1].messageId)
            ? replies[replies.length - 1].messageId.trim()
            : (ticket.messageId ? ticket.messageId.trim() : null);

        if (referencesList.length === 0 && threadMessageId) {
            referencesList.push(threadMessageId);
        }

        const referencesChain = referencesList.join(' ');

        logger.info(`🎟️ [TICKET] ✅ Reply added to database for Ticket ${ticket.ticketId}`);

        // CHG-015: Persist any new CC recipients to ticket.cc
        if (ccEmails && ccEmails.length > 0) {
            try {
                const existingCcs = Array.isArray(ticket.cc) ? ticket.cc : [];
                const mergedCcs = Array.from(new Set([...existingCcs, ...ccEmails].map(e => e.trim().toLowerCase()))).filter(Boolean);
                await prisma.ticket.update({
                    where: { id: ticket.id },
                    data: { cc: { set: mergedCcs } }
                });
                ticket.cc = mergedCcs; // Ensure in-memory ticket has updated CCs
            } catch (ccSaveErr) {
                logger.error(`Failed to update ticket.cc in replyToTicket: ${ccSaveErr.message}`);
            }
        }

        // 3. Send Email to Client via MS Graph
        // If the frontend provided a pre-composed HTML body (with formatted signature + images),
        // use it directly. Otherwise fall back to plain-text → HTML conversion.
        const emailService = require('./emailService');
        logger.info(`🎟️ [TICKET] 📧 Sending Agent Reply Email to: ${recipientEmails.join(', ')} | Subject: ${emailSubject}`);

        const baseEmailHtml = htmlContent
            ? htmlContent   // ← Rich HTML: bold, italic, images, font colors all preserved
            : `<div style="font-family: Arial, sans-serif;">
                <p>${message.replace(/\n/g, '<br>')}</p>
                <br/>
                <hr/>
                <p style="font-size: 12px; color: #666;">${agentName}<br/>EdgeStone Support</p>
               </div>`;

        const finalEmailHtml = baseEmailHtml;
        const finalEmailText = message || '';

        const sentResult = await emailService.sendAgentReplyEmail({
            to: recipientEmails,
            cc: ccEmails,
            bcc: bccEmails,
            subject: emailSubject,
            html: finalEmailHtml,
            text: finalEmailText,
            inReplyTo: threadMessageId,
            references: referencesChain || threadMessageId,
            attachments: attachments || []
        });

        logger.info(`🎟️ [TICKET] 📤 Reply email sent to ${recipientEmails.join(', ')}`);

        // Try to capture and save the outgoing Message-ID for future reverse-matching
        try {
            // Nodemailer returns messageId directly on the info object
            const outboundMessageId = sentResult?.messageId;

            if (outboundMessageId) {
                await TicketModel.updateReply(reply.id, { messageId: outboundMessageId });
                logger.info(`🎟️ [TICKET] 💾 Saved outbound messageId ${outboundMessageId} to Reply record for threading.`);
            }
        } catch (captureErr) {
            logger.warn(`⚠️ 🎟️ [TICKET] ⚠️ Failed to capture outbound messageId: ${captureErr.message}`);
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

        logger.info(`🎟️ [TICKET] 📊 Activity logged: reply by ${agentName}`);

        // --- AUTOMATIC SLA START ON FIRST AGENT REPLY TO CLIENT ---
        try {
            const existingClientSla = await prisma.sLARecord.findFirst({
                where: { ticketId: ticket.id, type: 'CLIENT' }
            });

            if (!existingClientSla) {
                const slaStart = new Date();
                await prisma.sLARecord.create({
                    data: {
                        ticketId: ticket.id,
                        type: 'CLIENT',
                        startDate: slaStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
                        startTime: slaStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).replace(/^24:/, '00:'),
                        status: 'Safe',
                        compensation: '-',
                        statusReason: 'Client SLA started'
                    }
                });
                logger.info(`⏱️ [SLA] ✨ Client SLA clock started for Ticket ${ticket.ticketId}`);
            }
        } catch (slaErr) {
            logger.warn(`⚠️ ⏱️ [SLA] ⚠️ Failed to start Client SLA: ${slaErr.message}`);
        }

        return reply;

    } catch (error) {
        logger.error(`🚨 🎟️ [TICKET] ❌ Error in replyToTicket: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

const updateTicket = async (ticketId, updates, agentName) => {
    logger.info(`🎟️ [TICKET] 🔄 Updating ticket ${ticketId} by ${agentName}`);
    logger.debug(`🐞 🎟️ [TICKET] Updates: ${JSON.stringify(updates)}`);

    try {
        // 1. Find the ticket
        let ticket;
        if (ticketId.startsWith('#')) {
            const prisma = require('../models/index');
            ticket = await prisma.ticket.findFirst({ where: { ticketId: { equals: ticketId, mode: 'insensitive' } } });
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
                logger.info(`🎟️ [TICKET] ✨ Auto-transitioning ticket to "In Progress" (circuit + priority set)`);

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

        // 3. Log individual field changes & sync client/vendor from circuit if missing
        if (updates.circuitId && updates.circuitId !== ticket.circuitId) {
            const prisma = require('../models/index');
            const circuit = await prisma.circuit.findFirst({
                where: {
                    OR: [
                        { customerCircuitId: updates.circuitId },
                        { supplierCircuitId: updates.circuitId },
                        { id: updates.circuitId }
                    ]
                }
            });
            if (circuit) {
                if (!ticket.clientId && circuit.clientId) {
                    finalUpdates.clientId = circuit.clientId;
                    logger.info(`🎟️ [TICKET] 🔗 Inherited Client ${circuit.clientId} for Ticket ${ticket.ticketId} from Circuit ${updates.circuitId}`);
                }
                if (!ticket.vendorId && circuit.vendorId) {
                    finalUpdates.vendorId = circuit.vendorId;
                }
            }

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

        logger.info(`🎟️ [TICKET] ✅ Ticket ${ticket.ticketId} updated successfully. New status: ${updatedTicket.status}`);

        // --- NEW: SLA Engine Integration for Ticket Closure ---
        if (finalUpdates.status === 'Closed' && ticket.status !== 'Closed') {
            try {
                // 1. Close the SLA record and auto-trigger compensation engine
                const nowClosed = new Date();
                const closeDate = nowClosed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
                const closedTime = nowClosed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).replace(/^24:/, '00:') + ' hrs';
                
                const slaRecordService = require('./slaRecordService');
                await slaRecordService.updateSLAClosure(ticket.id, closeDate, closedTime);
                logger.info(`🎟️ [TICKET] ✅ SLA records closed successfully for Ticket ${ticket.ticketId}`);
            } catch (slaErr) {
                logger.error(`🚨 🎟️ [TICKET] ❌ Complete SLA Update Lifecycle failed for Ticket ${ticket.ticketId}: ${slaErr.message}`, { stack: slaErr.stack });
            }
        }
        // -----------------------------------------------------------

        return updatedTicket;

    } catch (error) {
        logger.error(`🚨 🎟️ [TICKET] ❌ Error in updateTicket: ${error.message}`, { stack: error.stack });
        throw error;
    }
};
const sendManualAutoReply = async (ticketId, toEmails, agentName = 'System', agentEmail = 'support@edgestone.in') => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error('Ticket not found');
        
        const emailService = require('./emailService');
        const messageId = ticket.messageId;
        
        // Use provided toEmails or fallback to ticket email
        const targetEmails = (toEmails && toEmails.length > 0) ? toEmails : [ticket.email];

        logger.info(`🎟️ [TICKET] 🤖 Sending manual auto-reply to ${targetEmails.join(', ')} for Ticket ${ticket.ticketId}...`);
        
        await emailService.sendEmail({
            to: targetEmails,
            subject: `Re: [${ticket.ticketId}] ${ticket.header}`,
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
        
        const ActivityLogModel = require('../models/activityLog');
        const now = new Date();
        await ActivityLogModel.createActivityLog({
            ticketId: ticket.id,
            action: 'auto_replied',
            description: `Auto-reply manually sent to ${targetEmails.join(', ')}`,
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            author: agentName
        });
        
        logger.info(`🎟️ [TICKET] 📤 Manual Auto-reply sent successfully to ${targetEmails.join(', ')}`);
        
        return ticket;
    } catch (error) {
        logger.error(`🚨 🎟️ [TICKET] ❌ FAILED to send manual auto-reply for Ticket ${ticketId}: ${error.message}`);
        throw error;
    }
};

const deleteTicket = async (id) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const cleanId = id.trim();
        const formattedId = cleanId.startsWith('#') ? cleanId : `#${cleanId}`;

        const ticket = await prisma.ticket.findFirst({
            where: {
                OR: [
                    { id: cleanId },
                    { ticketId: cleanId },
                    { ticketId: formattedId }
                ]
            }
        });

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        const targetId = ticket.id;
        logger.info(`🎟️ [TICKET] 🗑️ Commencing cascading deletion of Ticket ${ticket.ticketId} (UUID: ${targetId})`);

        await prisma.reply.deleteMany({ where: { ticketId: targetId } });
        await prisma.note.deleteMany({ where: { ticketId: targetId } });
        await prisma.workNote.deleteMany({ where: { ticketId: targetId } });
        await prisma.sLARecord.deleteMany({ where: { ticketId: targetId } });
        await prisma.activityLog.deleteMany({ where: { ticketId: targetId } });
        await prisma.notification.deleteMany({
            where: {
                OR: [
                    { ticketId: targetId },
                    { ticketId: ticket.ticketId }
                ]
            }
        });

        const deletedTicket = await prisma.ticket.delete({ where: { id: targetId } });
        logger.info(`🎟️ [TICKET] ✅ Ticket ${ticket.ticketId} deleted successfully along with all child records`);
        return deletedTicket;
    } catch (error) {
        logger.error(`🚨 🎟️ [TICKET] ❌ Error deleting ticket ${id}: ${error.message}`, { stack: error.stack });
        throw error;
    }
};

module.exports = {
    createTicketFromEmail,
    getTickets,
    updateTicket,
    replyToTicket,
    sendManualAutoReply,
    appendClientReplyToTicket,
    appendVendorReplyToTicket,
    appendAgentReplyFromOutlook,
    findExistingTicketForReply,
    stripHtml,
    stripQuotedReply,
    deleteTicket
};
