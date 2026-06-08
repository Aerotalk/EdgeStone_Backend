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
const findExistingTicketForReply = async (inReplyTo, references, subject) => {
    // 0. Strategy A: Subject regex extraction (Most Reliable)
    // Agent replies always have "[#1234]" or "[#V1234]" or "[#1234-V]" in the subject.
    if (subject) {
        const ticketIdMatch = subject.match(/\[(#V?\d+)(?:-V)?\]/i);
        if (ticketIdMatch && ticketIdMatch[1]) {
            const friendlyId = ticketIdMatch[1].toUpperCase(); // standardize case
            const prisma = require('../models/index');
            const ticket = await prisma.ticket.findFirst({
                where: { ticketId: { equals: friendlyId, mode: 'insensitive' } }
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
                logger.info(`🎟️ [TICKET] 🧵 Reply matched via References: ${refId} → Ticket ${ticket.ticketId}`);
                return ticket;
            }
        }
    }

    // 3. Subject fallback: "Re: <original subject>" — strip Re:/Fwd: prefixes and match
    // BUG FIX: Only apply subject fallback if it ACTUALLY had a Re:/Fwd: prefix!
    // This prevents generic subjects like "Test", "Urgent", or "Help" from cross-contaminating unrelated tickets.
    if (subject) {
        const isReplyPattern = /^(Re|Fwd|FW|RE|FWD):\s*/i.test(subject);
        const stripped = subject.replace(/^(Re|Fwd|FW|RE|FWD):\s*/gi, '').trim();
        
        if (stripped && isReplyPattern) {
            const prisma = require('../models/index');
            const allTickets = await prisma.ticket.findMany({ select: { id: true, ticketId: true, header: true } });
            const match = allTickets.find(t =>
                t.header && t.header.replace(/^(Re|Fwd|FW|RE|FWD):\s*/gi, '').trim() === stripped
            );
            if (match) {
                logger.info(`🎟️ [TICKET] 🧵 Reply matched via subject fallback: "${stripped}" → Ticket ${match.ticketId}`);
                return await TicketModel.findTicketById(match.id);
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

    logger.info(`🎟️ [TICKET] 📩 Appending client reply to existing Ticket ${ticket.ticketId} from ${from}`);

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
        messageId: emailData.messageId || null,
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

    logger.info(`🎟️ [TICKET] ✅ Client reply appended to Ticket ${ticket.ticketId}`);
    try {
        const notificationService = require('./notificationService');
        let message = `Customer replied to Ticket ${ticket.ticketId}`;
        if (ticket.status.toLowerCase() === 'closed') {
            message = `Customer replied to Ticket ${ticket.ticketId} which is closed, please re-open it to continue conversation`;
        }
        notificationService.sendNotification({ type: 'client_reply', message, ticketId: ticket.ticketId });
    } catch(err) { logger.error(`Notification Error: ${err.message}`) }
    return reply;
};

// ─────────────────────────────────────────────────────────────────────────────
// appendVendorReplyToTicket
// Appends a vendor's reply email to an existing ticket's vendor thread.
// ─────────────────────────────────────────────────────────────────────────────
const appendVendorReplyToTicket = async (ticket, emailData) => {
    const { from, fromName, body, html, date } = emailData;
    const emailReceivedDate = date ? new Date(date) : new Date();

    logger.info(`📝 [TICKET] 📥 Appending vendor reply to existing Ticket ${ticket.ticketId} from ${from}`);

    const replyText = stripHtml(body || html) || '(No Content)';

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
        category: 'vendor',
        to: [from],
        messageId: emailData.messageId || null,
    });

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
        notificationService.sendNotification({ type: 'vendor_reply', message: `Vendor replied to Ticket ${ticket.ticketId}`, ticketId: ticket.ticketId });
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
                    startTime: slaStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }),
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
        const existingTicket = await findExistingTicketForReply(inReplyTo, references, subject);
        if (existingTicket) {
            // Determine if the sender is a known Vendor (case-insensitive)
            const VendorModel = require('../models/vendor');
            const vendors = await VendorModel.findAllVendors();
            let isVendor = vendors.some(v => v.emails.some(e => e.toLowerCase() === from.toLowerCase()));
            
            // PREVENT FALSE POSITIVE: If the sender is the original client, don't default to vendor thread
            if (existingTicket.email && existingTicket.email.toLowerCase() === from.toLowerCase()) {
                isVendor = false;
            }

            // EXPLICIT ROUTING: If the subject contains the explicit vendor suffix (e.g. [#1024-V]), force it into vendor thread
            // even if the email doesn't strictly match the saved vendor emails list in the DB yet!
            if (subject && /\[#V?\d+-V\]/i.test(subject)) {
                logger.info(`🎟️ [TICKET] 🧵 Force-routing reply into Vendor thread due to -V tag in subject`);
                isVendor = true;
            }

            if (isVendor) {
                return await appendVendorReplyToTicket(existingTicket, emailData);
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

        const aiService = require('./aiService');
        
        try {
            // Fetch circuits including supplier IDs, clientId and vendorId for disambiguation
            const allCircuits = await prisma.circuit.findMany({ 
                select: { id: true, customerCircuitId: true, supplierCircuitId: true, clientId: true, vendorId: true } 
            });
            
            const validCircuitIds = [];
            allCircuits.forEach(c => {
                if (c.customerCircuitId) validCircuitIds.push(c.customerCircuitId);
                if (c.supplierCircuitId) validCircuitIds.push(c.supplierCircuitId);
            });

            // ── STAGE 1: Direct Regex Pre-Check (fast, reliable, AI-independent) ──
            // Scans subject AND body for any known Circuit ID using case-insensitive string matching.
            // This catches cases where the AI may fail, time out, or be disabled.
            const subjectUpper = (subject || '').toUpperCase();
            const bodyUpper = (body || '').toUpperCase();

            for (const vid of validCircuitIds) {
                const vidUpper = vid.toUpperCase();
                if (subjectUpper.includes(vidUpper)) {
                    const matchingCircuit = allCircuits.find(c =>
                        (c.customerCircuitId && c.customerCircuitId.toUpperCase() === vidUpper) ||
                        (c.supplierCircuitId && c.supplierCircuitId.toUpperCase() === vidUpper)
                    );
                    if (matchingCircuit) {
                        circuitId = matchingCircuit.customerCircuitId;
                        circuitUUID = matchingCircuit.id;
                        foundLocation = 'subject';
                        logger.info(`🎟️ [TICKET] 🔍 Regex Pre-Check: Detected Circuit ID "${vid}" in SUBJECT. Skipping AI call.`);
                        break;
                    }
                }
            }

            // If subject scan missed it, check the body
            if (!circuitId) {
                for (const vid of validCircuitIds) {
                    const vidUpper = vid.toUpperCase();
                    if (bodyUpper.includes(vidUpper)) {
                        const matchingCircuit = allCircuits.find(c =>
                            (c.customerCircuitId && c.customerCircuitId.toUpperCase() === vidUpper) ||
                            (c.supplierCircuitId && c.supplierCircuitId.toUpperCase() === vidUpper)
                        );
                        if (matchingCircuit) {
                            circuitId = matchingCircuit.customerCircuitId;
                            circuitUUID = matchingCircuit.id;
                            foundLocation = 'body';
                            logger.info(`🎟️ [TICKET] 🔍 Regex Pre-Check: Detected Circuit ID "${vid}" in BODY. Skipping AI call.`);
                            break;
                        }
                    }
                }
            }

            // ── STAGE 2: AI Fallback (only if regex didn't find anything) ──
            // Handles ambiguous phrasing like "the above circuit ID" where the ID
            // might be inferred from context across subject+body together.
            if (!circuitId) {
                logger.info(`🎟️ [TICKET] 🤖 Regex pre-check found nothing. Delegating to AI for Circuit ID detection...`);
                const aiResult = await aiService.analyzeEmailForCircuitId(subject, body, validCircuitIds);
                
                if (aiResult && aiResult.circuitId && aiResult.foundIn !== 'none') {
                    const matchingCircuit = allCircuits.find(c => 
                        (c.customerCircuitId && c.customerCircuitId.toUpperCase() === aiResult.circuitId.toUpperCase()) || 
                        (c.supplierCircuitId && c.supplierCircuitId.toUpperCase() === aiResult.circuitId.toUpperCase())
                    );
                    
                    if (matchingCircuit) {
                        circuitId = matchingCircuit.customerCircuitId;
                        circuitUUID = matchingCircuit.id;
                        foundLocation = aiResult.foundIn;
                        logger.info(`🎟️ [TICKET] 🧠 AI Smart Auto-Detected Circuit ID: ${aiResult.circuitId} in ${foundLocation}`);
                    }
                }
            }

            // --- Disambiguate Sender based on detected circuit ---
            if (circuitId) {
                const detectedCircuitRecord = allCircuits.find(c => c.customerCircuitId === circuitId || c.supplierCircuitId === circuitId);
                if (detectedCircuitRecord) {
                    if (detectedCircuitRecord.clientId && potentialClientIds.includes(detectedCircuitRecord.clientId)) {
                        clientId = detectedCircuitRecord.clientId;
                        ticketType = 'Client';
                        vendorId = null;
                        logger.info(`🎟️ [TICKET] 🎯 Disambiguated Sender: Assigned to Client ${clientId} based on Circuit ${circuitId}`);
                    } else if (detectedCircuitRecord.vendorId && potentialVendorIds.includes(detectedCircuitRecord.vendorId)) {
                        vendorId = detectedCircuitRecord.vendorId;
                        ticketType = 'Vendor';
                        clientId = null;
                        logger.info(`🎟️ [TICKET] 🎯 Disambiguated Sender: Assigned to Vendor ${vendorId} based on Circuit ${circuitId}`);
                    }
                }
            }

        } catch (dbErr) {
            logger.error(`🚨 🎟️ [TICKET] ❌ Failed to process AI Circuit identification: ${dbErr.message}`);
        }

        // 🛡️ CRITICAL GATE: If no circuit matches the DB, absolutely DO NOT create a ticket!
        if (!circuitId) {
            logger.warn(`⚠️ 🎟️ [TICKET] 🚫 DROPPED EMAIL: Subject "${subject}" from ${from} does not contain any recognized Circuit ID natively or via AI. Ticket will NOT be created.`);
            
            // Send AI rejection email if they are a valid Client
            if (clientId) {
                logger.info(`🤖 🎟️ [TICKET] Sending AI missing-circuit rejection email to valid client: ${from}`);
                const aiReplyText = await aiService.generateMissingCircuitIdReply(fromName || from, subject, body);
                const emailService = require('./emailService');
                
                emailService.sendEmail({
                    to: from,
                    subject: `Re: ${subject || 'Support Request'}`,
                    text: aiReplyText,
                    html: `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">${aiReplyText.replace(/\n/g, '<br>')}</div>`
                }).catch(err => logger.error(`🚨 [TICKET] Failed to send missing-circuit rejection email: ${err.message}`));
            }
            
            return null;
        }

        // 💡 NEW TICKET AI RULE: Circuit ID found in body but NOT subject -> create ticket but send a warning back
        if (foundLocation === 'body') {
             logger.info(`⚠️ 🎟️ [TICKET] AI detected Circuit ID (${circuitId}) only in the body. Triggering AI warning email.`);
             
             // Wrap in an async IIFE to fire-and-forget without blocking ticket creation
             (async () => {
                 try {
                     const aiWarningText = await aiService.generateBodyCircuitIdWarning(fromName || from, circuitId);
                     const emailService = require('./emailService');
                     
                     await emailService.sendEmail({
                        to: from,
                        subject: `Re: ${subject || 'Your Support Request'}`,
                        html: `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">${aiWarningText.replace(/\n/g, '<br>')}</div>`,
                        text: aiWarningText,
                     });
                     logger.info(`🤖 🎟️ [TICKET] Successfully sent AI warning email about putting Circuit ID in subject to ${from}`);
                 } catch (err) {
                     logger.error(`🚨 [TICKET] Failed to send AI warning email: ${err.message}`);
                 }
             })();
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

        // Note: SLA creation has been moved to appendVendorReplyToTicket 
        // to strictly enforce that SLA only begins when the Vendor replies.
        // 6. Send Auto-Reply with 5-second delay (Only for Clients)
        if (ticketType === 'Vendor') {
            logger.info(`🎟️ [TICKET] ⏰ Skipping auto-reply for Vendor ticket ${ticket.ticketId} to prevent infinite automated loops.`);
            return ticket;
        }
        // Lazy load emailService to avoid circular dependency
        const emailService = require('./emailService');

        logger.info(`🎟️ [TICKET] ⏰ Scheduling auto-reply to ${from} in 5 seconds...`);

        setTimeout(async () => {
            try {
                logger.info(`🎟️ [TICKET] 🔄 Initiating auto-reply sequence for Ticket ${ticket.ticketId}...`);
                await emailService.sendEmail({
                    to: from,
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

                logger.info(`🎟️ [TICKET] 📤 Auto-reply sent successfully to ${from}`);

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
                logger.error(`🚨 🎟️ [TICKET] ❌ FAILED to send auto-reply for Ticket ${ticket.ticketId}`);
                logger.error(`🚨 🎟️ [TICKET] ❌ Reason: ${error.message}`);
                logger.error(`🚨 🎟️ [TICKET] ⚠️ Check EMAIL_PROVIDER and provider credentials (ZEPTO_MAIL_TOKEN / RESEND_API_KEY).`, { stack: error.stack });
            }
        }, 5000); // 5 seconds delay

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

const replyToTicket = async (ticketId, message, agentEmail, agentName, htmlContent, attachments) => {
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
            to: [ticket.email],
        });

        // 2.5 Find last message ID in thread for accurate In-Reply-To
        const prisma = require('../models/index');
        const replies = await prisma.reply.findMany({
            where: { ticketId: ticket.id, messageId: { not: null } },
            orderBy: { createdAt: 'desc' },
            take: 1
        });
        const threadMessageId = (replies.length > 0 && replies[0].messageId) ? replies[0].messageId : (ticket.messageId || null);

        logger.info(`🎟️ [TICKET] ✅ Reply added to database for Ticket ${ticket.ticketId}`);

        // 3. Send Email to Client via MS Graph
        // If the frontend provided a pre-composed HTML body (with formatted signature + images),
        // use it directly. Otherwise fall back to plain-text → HTML conversion.
        const emailService = require('./emailService');
        logger.info(`🎟️ [TICKET] 📧 Sending Agent Reply Email to: ${ticket.email} | Subject: Re: ${ticket.header}`);

        const emailHtml = htmlContent
            ? htmlContent   // ← Rich HTML: bold, italic, images, font colors all preserved
            : `<div style="font-family: Arial, sans-serif;">
                <p>${message.replace(/\n/g, '<br>')}</p>
                <br/>
                <hr/>
                <p style="font-size: 12px; color: #666;">${agentName}<br/>EdgeStone Support</p>
               </div>`;

        const sentResult = await emailService.sendAgentReplyEmail({
            to: ticket.email,
            subject: `Re: [${ticket.ticketId}] ${ticket.header}`,
            html: emailHtml,
            text: message,   // plain-text fallback for clients that don't render HTML
            inReplyTo: threadMessageId,
            references: threadMessageId,
            attachments: attachments || []
        });

        logger.info(`🎟️ [TICKET] 📤 Reply email sent to ${ticket.email}`);

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
                        startTime: slaStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }),
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

        logger.info(`🎟️ [TICKET] ✅ Ticket ${ticket.ticketId} updated successfully. New status: ${updatedTicket.status}`);

        // --- NEW: SLA Engine Integration for Ticket Closure ---
        if (finalUpdates.status === 'Closed' && ticket.status !== 'Closed') {
            try {
                // 1. Close the SLA record
                const nowClosed = new Date();
                const closeDate = nowClosed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                const closedTime = nowClosed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
                
                const slaRecordService = require('./slaRecordService');
                const updatedSlaRecord = await slaRecordService.updateSLAClosure(ticket.id, closeDate, closedTime);
                
                // 2. Calculate the specific ticket's downtime
                if (updatedSlaRecord && updatedSlaRecord.startDate && updatedSlaRecord.startTime) {
                    const startStr = `${updatedSlaRecord.startDate} ${updatedSlaRecord.startTime.replace(' hrs', '')}`;
                    const endStr = `${updatedSlaRecord.closeDate} ${updatedSlaRecord.closedTime.replace(' hrs', '')}`;
                    const sTime = new Date(startStr);
                    const eTime = new Date(endStr);
                    
                    if (!isNaN(sTime.getTime()) && !isNaN(eTime.getTime())) {
                        const diffMins = Math.round((eTime.getTime() - sTime.getTime()) / 60000);
                        
                        logger.info(`🎟️ [TICKET] ⏱️ Ticket ${ticket.ticketId} downtime calculated as ${diffMins} minutes.`);

                        // 3. Forward downtime to Circuit SLA engine
                        if (updatedTicket.circuitId && diffMins > 0) {
                            const prisma = require('../models/index');
                            
                            // Find circuit UUID by customerCircuitId or supplierCircuitId
                            const circuit = await prisma.circuit.findFirst({
                                where: {
                                    OR: [
                                        { customerCircuitId: updatedTicket.circuitId },
                                        { supplierCircuitId: updatedTicket.circuitId }
                                    ]
                                },
                                select: { id: true, mrc: true, supplierMrc: true }
                            });

                            if (circuit) {
                                // Find all SLAs belonging to this circuit
                                const circuitSlas = await prisma.sla.findMany({ where: { circuitId: circuit.id } });
                                
                                if (circuitSlas.length > 0) {
                                    const slaService = require('./slaService');
                                    // Calculate exact minutes in the current month instead of flat 30 days
                                    const daysInMonth = new Date(nowClosed.getFullYear(), nowClosed.getMonth() + 1, 0).getDate();
                                    const totalUptimeMinutes = daysInMonth * 24 * 60; 
                                    
                                    logger.info(`🎟️ [TICKET] ⚙️ Syncing ${diffMins} mins downtime to ${circuitSlas.length} SLA(s) for Circuit ${circuit.id} (Uptime Baseline: ${totalUptimeMinutes}m)`);
                                    
                                    let highestCompensation = 0;
                                    let highestStatus = 'SAFE';
                                    for (const s of circuitSlas) {
                                        const updatedSla = await slaService.calculateSla(s.id, diffMins, totalUptimeMinutes);
                                        // Track the worst-case compensation across all SLAs on the circuit
                                        if (updatedSla.compensationAmount > highestCompensation) {
                                            highestCompensation = updatedSla.compensationAmount;
                                            highestStatus = updatedSla.status;
                                        }
                                    }
                                    logger.info(`🎟️ [TICKET] ✅ Circuit SLA engine results: status=${highestStatus}, compensation=${highestCompensation}%`);

                                    // 4. Write compensation result BACK to the ticket's SLARecord
                                    // This is what makes compensation visible in the Ticket dashboard sidebar
                                    let compensationDisplay = '-';
                                    if (highestCompensation > 0) {
                                        // Use customer MRC or supplier MRC depending on the ticket type/SLA context.
                                        // For now defaulting to circuit.mrc.
                                        const baseMrc = circuit.mrc || 0;
                                        const actualValue = (highestCompensation * baseMrc) / 100;
                                        compensationDisplay = `$${actualValue.toFixed(2)}`;
                                    }
                                    const slaStatusDisplay = highestStatus === 'BREACHED' ? 'Breached' : 'Safe';

                                    await prisma.sLARecord.update({
                                        where: { ticketId: ticket.id },
                                        data: {
                                            compensation: compensationDisplay,
                                            status: slaStatusDisplay,
                                            statusReason: highestCompensation > 0
                                                ? `Circuit SLA breached: ${highestCompensation}% compensation due`
                                                : 'Circuit availability within SLA bounds'
                                        }
                                    });
                                    logger.info(`🎟️ [TICKET] 💾 SLARecord updated — compensation: "${compensationDisplay}", status: "${slaStatusDisplay}"`);

                                } else {
                                    logger.warn(`⚠️ 🎟️ [TICKET] ⚠️ Circuit ${circuit.id} has no active SLAs to update.`);
                                }
                            } else {
                                logger.error(`🚨 🎟️ [TICKET] ❌ Could not find exact Circuit UUID for ticket's circuitId string: ${updatedTicket.circuitId}`);
                            }
                        }
                    }
                }
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



module.exports = {
    createTicketFromEmail,
    getTickets,
    updateTicket,
    replyToTicket
};

