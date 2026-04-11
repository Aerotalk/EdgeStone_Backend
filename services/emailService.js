'use strict';

const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Shared Graph API token cache (used by both polling and sending)
// ─────────────────────────────────────────────────────────────────────────────
let graphAccessToken = null;
let tokenExpiresAt = 0;
let graphPollInterval = null;

const getGraphAccessToken = async () => {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Missing MS Graph API configuration in environment (TENANT_ID / CLIENT_ID / CLIENT_SECRET).');
    }

    // Return cached token if still valid
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
    // Expire the cache 5 minutes before the actual token expiry
    tokenExpiresAt = Date.now() + ((result.expires_in - 300) * 1000);

    logger.info('🔑 MS Graph Access Token refreshed successfully.');
    return graphAccessToken;
};

// ─────────────────────────────────────────────────────────────────────────────
// sendViaGraph — Internal helper
// Sends an email via Microsoft Graph API /sendMail endpoint.
// This replaces nodemailer SMTP which is blocked by Azure AD Security Defaults.
// Supports threading via In-Reply-To and References headers.
// ─────────────────────────────────────────────────────────────────────────────
const sendViaGraph = async ({ to, subject, html, text, inReplyTo, references }) => {
    const senderEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    if (!senderEmail) {
        throw new Error('sendViaGraph: SENDER_EMAIL or MAIL_USER must be set in environment.');
    }

    const accessToken = await getGraphAccessToken();

    // Build the Graph API message body
    const message = {
        subject,
        body: {
            contentType: html ? 'HTML' : 'Text',
            content: html || text || '(No content)',
        },
        toRecipients: [
            {
                emailAddress: { address: to }
            }
        ],
        from: {
            emailAddress: {
                address: senderEmail,
                name: 'EdgeStone Support'
            }
        },
    };

    // NOTE: Microsoft Graph API only allows custom X- prefixed headers in internetMessageHeaders.
    // Standard RFC 5322 headers like 'In-Reply-To' and 'References' are BLOCKED and will throw:
    //   "The internet message header name should start with 'x-' or 'X-'"
    // Graph manages email threading internally via its own conversationId system.
    // We store our own tracking headers using X- prefix for internal reference only.
    if (inReplyTo || references) {
        message.internetMessageHeaders = [];
        if (inReplyTo) {
            message.internetMessageHeaders.push({ name: 'X-Ticket-In-Reply-To', value: inReplyTo });
            logger.info(`🧵 sendViaGraph: Storing In-Reply-To as X-Ticket-In-Reply-To: ${inReplyTo}`);
        }
        if (references) {
            message.internetMessageHeaders.push({ name: 'X-Ticket-References', value: references });
        } else if (inReplyTo) {
            message.internetMessageHeaders.push({ name: 'X-Ticket-References', value: inReplyTo });
        }
    }

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;

    const response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, saveToSentItems: true })
    });

    if (response.status === 202) {
        // 202 Accepted is the expected success response for /sendMail
        logger.info(`✅ sendViaGraph: Email sent successfully via Graph API | to: ${to} | subject: "${subject}"`);
        // Return a mock info object similar to nodemailer for compatibility
        return { messageId: null, accepted: [to], response: '202 Accepted' };
    }

    // Handle errors
    let errorBody = {};
    try {
        errorBody = await response.json();
    } catch (_) { /* ignore parse error */ }

    const errMsg = errorBody.error?.message || `HTTP ${response.status}`;
    throw new Error(`sendViaGraph: Graph API /sendMail failed: ${errMsg}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// sendEmail — Auto-reply / system notification sender (public API)
// Uses Graph API. No longer routes through SMTP.
// ─────────────────────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    // Input validation
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
    logger.info(`📧 sendEmail: Routing auto-reply via Graph API | to: ${to} | subject: "${safeSubject}"`);

    return sendViaGraph({ to, subject: safeSubject, html, text, inReplyTo, references });
};

// ─────────────────────────────────────────────────────────────────────────────
// sendAgentReplyEmail — Agent reply sender (public API)
// Uses Graph API. No longer routes through SMTP.
// ─────────────────────────────────────────────────────────────────────────────
const sendAgentReplyEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    if (!to || typeof to !== 'string' || !to.includes('@')) {
        throw new Error(`sendAgentReplyEmail: invalid "to" address: ${to}`);
    }
    if (!subject || !subject.trim()) {
        throw new Error('sendAgentReplyEmail: subject cannot be empty');
    }

    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').trim();
    logger.info(`📧 sendAgentReplyEmail: Routing agent reply via Graph API | to: ${to} | subject: "${safeSubject}"`);

    return sendViaGraph({ to, subject: safeSubject, html, text, inReplyTo, references });
};

// ─────────────────────────────────────────────────────────────────────────────
// markEmailAsRead — Marks a Graph email as read so it's not re-processed
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// fetchNewGraphEmails — Polls the Graph API inbox for unread messages
// Runs every 30 seconds via startImapListener()
// ─────────────────────────────────────────────────────────────────────────────
const fetchNewGraphEmails = async () => {
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    let accessToken;
    try {
        accessToken = await getGraphAccessToken();
    } catch (err) {
        logger.error(`❌ MS Graph Token Error: ${err.message}`);
        return;
    }

    logger.debug(`🔍 Polling Microsoft Graph for UNREAD messages in ${userEmail}...`);
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

        // The exact sender address of our own mailbox — used to skip auto-reply loops
        // BUG FIX: Match exact email address, NOT the entire @domain (old code dropped all @edgestone.in mail)
        const ownEmail = (process.env.SENDER_EMAIL || process.env.MAIL_USER || '').toLowerCase();

        for (const msg of messages) {
            const messageId = msg.internetMessageId || msg.id;
            const fromAddr = msg.from?.emailAddress?.address;
            const fromName = msg.from?.emailAddress?.name || fromAddr;

            if (!fromAddr) {
                logger.warn(`⚠️ Skipping email with no From address (Graph ID: ${msg.id})`);
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            // BUG FIX: Only skip emails sent FROM our own support mailbox (exact match)
            // Previously used domain match (@edgestone.in) which silently dropped ALL edgestone.in emails
            if (ownEmail && fromAddr.toLowerCase() === ownEmail) {
                logger.info(`🔁 Skipping email from own mailbox (${fromAddr}) — loop prevention`);
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            // Extract RFC 5322 threading headers
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
                attachments: []
            };

            const recipient = msg.toRecipients?.map(r => r.emailAddress?.address).join(', ') || 'unknown';
            logger.info(`📩 Graph Email received | from: ${fromAddr} | to: ${recipient} | subject: "${emailData.subject}"`);

            try {
                await ticketService.createTicketFromEmail(emailData);
                await markEmailAsRead(msg.id, accessToken);
            } catch (e) {
                logger.error(`❌ Error creating ticket from Graph email: ${e.message}`, { stack: e.stack });
            }
        }

    } catch (err) {
        logger.error(`❌ Graph Mail Fetch Request Error: ${err.message}`);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// startImapListener — Starts the Graph API polling loop
// Retained alias so existing require() calls in server.js don't break
// ─────────────────────────────────────────────────────────────────────────────
const startImapListener = () => {
    logger.info('🔌 Starting Microsoft Graph API Email Poller (IMAP replaced)...');

    // Run immediately on start
    fetchNewGraphEmails();

    // Then poll every 30 seconds
    if (!graphPollInterval) {
        graphPollInterval = setInterval(fetchNewGraphEmails, 30000);
    }
};

module.exports = {
    sendEmail,
    sendAgentReplyEmail,
    startImapListener,
};
