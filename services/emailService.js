'use strict';

const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Shared Graph API token cache (used by both polling and sending)
// ─────────────────────────────────────────────────────────────────────────────
let graphAccessToken = null;
let tokenExpiresAt = 0;
let isPolling = false;
let graphPollInterval = null;

// In-memory set of Graph message IDs already processed this session.
// Safety net: prevents duplicate processing if markEmailAsRead is slow or fails.
const processedGraphIds = new Set();

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
            logger.error([EMAIL] Graph Mail API Error);
            isPolling = false;
            return;
        }
    
    isPolling = true;
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    let accessToken;
    try {
        accessToken = await getGraphAccessToken();
    } catch (err) {
        logger.error(`🚨 📧 [EMAIL] ❌ MS Graph Token Error: ${err.message}`);
        isPolling = false;
        return;
    }

    logger.debug(`🐞 📧 [EMAIL] 🔍 Polling Microsoft Graph INBOX for UNREAD messages in ${userEmail}...`);
    // Use /mailFolders/inbox/messages — NOT /messages (which queries all folders incl. Sent Items).
    // Without this, auto-replies in Sent Items get re-picked and create duplicate ticket entries.
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/inbox/messages?$filter=isRead eq false&$top=20&$select=id,internetMessageId,subject,from,toRecipients,body,receivedDateTime,internetMessageHeaders,hasAttachments`;

    try {
        const response = await fetch(messagesUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const result = await response.json();
        if (!response.ok) {
            logger.error([EMAIL] Graph Mail API Error);
            isPolling = false;
            return;
        }

        const messages = result.value || [];
        if (messages.length === 0) {
            isPolling = false;
            return;
        }

        logger.info(`📧 [EMAIL] 📬 Found ${messages.length} unread message(s) via Graph API.`);

        // The exact sender address of our own mailbox — used to skip auto-reply loops
        // BUG FIX: Match exact email address, NOT the entire @domain (old code dropped all @edgestone.in mail)
        const ownEmail = (process.env.SENDER_EMAIL || process.env.MAIL_USER || '').toLowerCase();

        for (const msg of messages) {
            const messageId = msg.internetMessageId || msg.id;
            const fromAddr = msg.from?.emailAddress?.address;
            const fromName = msg.from?.emailAddress?.name || fromAddr;

            if (!fromAddr) {
                logger.warn(`⚠️ 📧 [EMAIL] ⚠️ Skipping email with no From address (Graph ID: ${msg.id})`);
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            // 🛡️ CRITICAL LOOP PREVENTION AND BOUNCE FILTERING 🛡️
            const subjectLower = (msg.subject || '').toLowerCase();
            const isOwnEmail = ownEmail && fromAddr.toLowerCase() === ownEmail;
            const isSystemBounce = 
                fromAddr.toLowerCase().includes('microsoftexchange') || 
                fromAddr.toLowerCase().includes('postmaster@') || 
                fromAddr.toLowerCase().includes('mailer-daemon@');
            const isBounceSubject = 
                subjectLower.includes('undeliverable:') || 
                subjectLower.includes('delivery status notification');

            if (isOwnEmail || isSystemBounce || isBounceSubject) {
                logger.info(`📧 [EMAIL] 🔁 LOOP PREVENTION: Skipping email from ${fromAddr} (Subject: ${msg.subject})`);
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
            logger.info(`📧 [EMAIL] 📩 Graph Email received | from: ${fromAddr} | to: ${recipient} | subject: "${emailData.subject}"`);

            try {
                // Skip if already processed in this session (safety net against rapid re-polls)
                if (processedGraphIds.has(msg.id)) {
                    logger.info(`📧 [EMAIL] 🔁 Skipping already-processed message ${msg.id}`);
                    await markEmailAsRead(msg.id, accessToken);
                    continue;
                }

                // Record as processed BEFORE awaiting ticket creation to prevent race conditions across polls
                processedGraphIds.add(msg.id);

                await ticketService.createTicketFromEmail(emailData);

                await markEmailAsRead(msg.id, accessToken);
            } catch (e) {
                // Remove from processed pool if ticket creation failed so it can be retried later, or keep it depending on strictness.
                // We keep it to prevent infinite loops of bad emails crashing the parser
                logger.error(`🚨 📧 [EMAIL] ❌ Error creating ticket from Graph email: ${e.message}`, { stack: e.stack });
            }
        }

    } catch (err) {
        logger.error(`🚨 📧 [EMAIL] ❌ Graph Mail Fetch Request Error: ${err.message}`);
    } finally {
        isPolling = false;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// startImapListener — Starts the Graph API polling loop
// Retained alias so existing require() calls in server.js don't break
// ─────────────────────────────────────────────────────────────────────────────
const startImapListener = () => {
    logger.info('📧 [EMAIL] 🔌 Starting Microsoft Graph API Email Poller (IMAP replaced)...');

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
