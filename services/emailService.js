const nodemailer = require('nodemailer');
const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Helper — retry with exponential backoff
// ─────────────────────────────────────────────────────────────────────────────
const withRetry = async (fn, { retries = 2, delayMs = 1500, label = 'operation' } = {}) => {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            if (attempt > retries) throw err;
            const wait = delayMs * attempt;
            logger.warn(`⚠️ ${label} failed (attempt ${attempt}/${retries}). Retrying in ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// sendEmail — primary public API
// Validates inputs, routes via Outlook SMTP, retries on transient failures.
// ─────────────────────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    const outlookMailService = require('./outlookMailService');

    // ── Input validation ──────────────────────────────────────────────────────
    if (!to || typeof to !== 'string' || !to.includes('@')) {
        throw new Error(`sendEmail: invalid "to" address: ${to}`);
    }
    if (!subject || !subject.trim()) {
        throw new Error('sendEmail: subject cannot be empty');
    }
    if (!html && !text) {
        logger.warn('⚠️ sendEmail called with no html or text body — sending anyway');
        text = '(No content)';
    }

    // Sanitise subject — strip control characters that can cause header injection
    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').trim();

    logger.info(`📧 Routing system email via Outlook SMTP | to: ${to} | subject: "${safeSubject}"`);

    return withRetry(
        () => outlookMailService.sendOutlookEmail({ to, subject: safeSubject, html, text }),
        { retries: 2, delayMs: 2000, label: 'Outlook system send' }
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft Graph API Listener (Replaces IMAP)
// Handles polling via HTTP every 30s to simulate an IMAP IDLE listener
// ─────────────────────────────────────────────────────────────────────────────

let graphAccessToken = null;
let tokenExpiresAt = 0;
let graphPollInterval = null;

const getGraphAccessToken = async () => {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error("Missing MS Graph API configuration in environment.");
    }

    if (graphAccessToken && Date.now() < tokenExpiresAt) {
        return graphAccessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenData = new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        body: tokenData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to get Graph Token: ${result.error_description || result.error}`);
    }

    graphAccessToken = result.access_token;
    // expire securely 5 minutes before actual expiration
    tokenExpiresAt = Date.now() + ((result.expires_in - 300) * 1000); 
    
    return graphAccessToken;
};

const markEmailAsRead = async (messageId, accessToken) => {
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    const patchUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${messageId}`;
    try {
        const res = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isRead: true })
        });
        if (!res.ok) {
            const err = await res.text();
            logger.error(`❌ Failed to mark message ${messageId} as read: ${err}`);
        } else {
            logger.info(`✅ Marked message ${messageId} as read`);
        }
    } catch (e) {
        logger.error(`❌ Error marking message as read: ${e.message}`);
    }
};

const fetchNewGraphEmails = async () => {
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    let accessToken;
    try {
        accessToken = await getGraphAccessToken();
    } catch (err) {
        logger.error(`❌ MS Graph Token Error: ${err.message}`);
        return;
    }

    logger.debug(`🔍 Polling Microsoft Graph for UNREAD messages...`);
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages?$filter=isRead eq false&$top=20&$select=id,internetMessageId,subject,from,toRecipients,body,receivedDateTime,internetMessageHeaders,hasAttachments`;

    try {
        const response = await fetch(messagesUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const result = await response.json();
        if (!response.ok) {
            logger.error(`❌ Graph Mail API Error: ${result.error?.message || JSON.stringify(result)}`);
            return;
        }

        const messages = result.value || [];
        if (messages.length === 0) {
            return;
        }

        logger.info(`📬 Found ${messages.length} unread message(s) via Graph API.`);

        for (const msg of messages) {
            const messageId = msg.internetMessageId || msg.id; // DB uses internetMessageId ideally for threading
            const fromAddr = msg.from?.emailAddress?.address;
            const fromName = msg.from?.emailAddress?.name || fromAddr;
            
            if (!fromAddr) {
                logger.warn(`⚠️ Skipping email with no From address (Graph ID: ${msg.id})`);
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            // Skip auto-reply loops
            const ownDomain = emailConfig.addresses.noReply ? `@${emailConfig.addresses.noReply.split('@')[1]}` : null;
            if (ownDomain && fromAddr.toLowerCase().endsWith(ownDomain.toLowerCase())) {
                logger.info(`🔁 Skipping email from own domain (${fromAddr}) — not a client email`);
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            // Extract Headers for threading
            let inReplyTo = null;
            let references = null;
            if (msg.internetMessageHeaders) {
                const inReplyToHeader = msg.internetMessageHeaders.find(h => h.name.toLowerCase() === 'in-reply-to');
                const referencesHeader = msg.internetMessageHeaders.find(h => h.name.toLowerCase() === 'references');
                if (inReplyToHeader) inReplyTo = inReplyToHeader.value;
                if (referencesHeader) references = referencesHeader.value;
            }

            const emailData = {
                from: fromAddr,
                fromName: fromName,
                subject: msg.subject || '(No Subject)',
                body: msg.body?.content || '',
                html: msg.body?.contentType === 'html' ? msg.body?.content : null,
                date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
                messageId: messageId,
                inReplyTo: inReplyTo,
                references: references,
                attachments: [] // Attachments could be fetched via separate call if required
            };

            const recipient = msg.toRecipients?.map(r => r.emailAddress?.address).join(', ') || 'unknown';
            logger.info(`📩 Graph Email received | from: ${fromAddr} | to: ${recipient} | subject: "${emailData.subject}"`);

            try {
                // Forward the payload to our existing ticketing system logic
                await ticketService.createTicketFromEmail(emailData);
                // After processing, mark as read so we don't process it again
                await markEmailAsRead(msg.id, accessToken);
            } catch (e) {
                logger.error(`❌ Error creating ticket from Graph email: ${e.message}`, { stack: e.stack });
            }
        }

    } catch (err) {
        logger.error(`❌ Graph Mail Fetch Request Error: ${err.message}`);
    }
};

const startImapListener = () => {
    logger.info('🔌 Starting Microsoft Graph API Email Poller (replacing IMAP listener)...');
    
    // Run immediately on start
    fetchNewGraphEmails();

    // Poll every 30 seconds
    if (!graphPollInterval) {
        graphPollInterval = setInterval(fetchNewGraphEmails, 30000);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// sendAgentReplyEmail — sends an agent reply via Outlook SMTP.
// ─────────────────────────────────────────────────────────────────────────────
const sendAgentReplyEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    const outlookMailService = require('./outlookMailService');

    if (!to || typeof to !== 'string' || !to.includes('@')) {
        throw new Error(`sendAgentReplyEmail: invalid "to" address: ${to}`);
    }
    if (!subject || !subject.trim()) {
        throw new Error('sendAgentReplyEmail: subject cannot be empty');
    }

    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').trim();
    logger.info(`📧 Routing agent reply via Outlook SMTP | to: ${to} | subject: "${safeSubject}"`);

    return outlookMailService.sendOutlookReplyEmail({ to, subject: safeSubject, html, text, inReplyTo, references });
};

module.exports = {
    sendEmail,
    sendAgentReplyEmail,
    startImapListener // Retained alias so existing require() statements don't break
};
