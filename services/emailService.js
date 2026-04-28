'use strict';

const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');

let graphAccessToken = null;
let tokenExpiresAt = 0;
let isPolling = false;
let graphPollInterval = null;

const processedGraphIds = new Set();

const getGraphAccessToken = async () => {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Missing MS Graph API configuration.');
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
        throw new Error(`Graph Token Error: ${result.error?.message}`);
    }

    graphAccessToken = result.access_token;
    tokenExpiresAt = Date.now() + (result.expires_in * 1000) - 300000;
    return graphAccessToken;
};

const sendViaGraph = async (options) => {
    const { to, cc, bcc, subject, text, body, html, inReplyTo, references, extraHeaders = {} } = options;
    const accessToken = await getGraphAccessToken();
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    
    const formatRecipients = (recipients) => {
        if (!recipients) return [];
        const arr = Array.isArray(recipients) ? recipients : [recipients];
        return arr.map(email => ({ emailAddress: { address: email } }));
    };

    const message = {
        subject: subject,
        body: {
            contentType: html ? 'HTML' : 'Text',
            content: html || text || body || ''
        },
        toRecipients: formatRecipients(to)
    };

    if (cc) {
        const ccRecips = formatRecipients(cc);
        if (ccRecips.length > 0) message.ccRecipients = ccRecips;
    }
    if (bcc) {
        const bccRecips = formatRecipients(bcc);
        if (bccRecips.length > 0) message.bccRecipients = bccRecips;
    }

    const headers = [];
    
    const addHeader = (name, value) => {
        if (!name.toLowerCase().startsWith('x-')) {
            name = `X-${name}`;
        }
        headers.push({ name, value });
    };

    if (inReplyTo) addHeader('In-Reply-To', inReplyTo);
    if (references) addHeader('References', references);
    
    Object.keys(extraHeaders).forEach(key => {
        addHeader(key, extraHeaders[key]);
    });

    if (headers.length > 0) {
        message.internetMessageHeaders = headers;
    }

    const headersUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/sendMail`;
    
    const response = await fetch(headersUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, saveToSentItems: true })
    });

    const toEmails = Array.isArray(to) ? to.join(', ') : to;

    if (response.ok || response.status === 202) {
        logger.info(`[EMAIL] Sent email via Graph to ${toEmails}`);
        return { messageId: null, accepted: Array.isArray(to) ? to : [to], response: '202 Accepted' };
    }
    
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`SendMail failed: ${errBody.error?.message || response.status}`);
};

const sendEmail = async (options) => {
    return sendViaGraph(options);
};

const sendAgentReplyEmail = async (options) => {
    const toEmails = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    logger.info(`[EMAIL] Sending Agent Reply to ${toEmails} for Subject: ${options.subject}`);
    return sendViaGraph(options);
};

const markEmailAsRead = async (messageId, accessToken) => {
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${messageId}`;
    await fetch(url, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true })
    });
};

const fetchNewGraphEmails = async () => {
    if (isPolling) return;
    isPolling = true;

    try {
        const accessToken = await getGraphAccessToken();
        const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
        const messagesUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/inbox/messages?$filter=isRead eq false&$top=20&$select=id,internetMessageId,subject,from,toRecipients,body,receivedDateTime,internetMessageHeaders,hasAttachments`;

        const response = await fetch(messagesUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!response.ok) return;

        const result = await response.json();
        const messages = result.value || [];
        if (messages.length === 0) return;

        const ownEmail = (process.env.SENDER_EMAIL || process.env.MAIL_USER || '').toLowerCase();

        for (const msg of messages) {
            const messageId = msg.internetMessageId || msg.id;
            const fromAddr = msg.from?.emailAddress?.address;
            const fromName = msg.from?.emailAddress?.name || fromAddr;

            if (!fromAddr) {
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            const subjectLower = (msg.subject || '').toLowerCase();
            const isOwnEmail = ownEmail && fromAddr.toLowerCase() === ownEmail;
            const isSystemBounce = fromAddr.toLowerCase().includes('postmaster') || fromAddr.toLowerCase().includes('mailer-daemon');
            
            if (isOwnEmail || isSystemBounce) {
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            const emailData = {
                from: fromAddr,
                fromName: fromName,
                subject: msg.subject || '(No Subject)',
                body: msg.body?.content || '',
                html: msg.body?.contentType === 'html' ? msg.body?.content : null,
                date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
                messageId: messageId,
                inReplyTo: null,
                references: null,
                attachments: []
            };

            if (processedGraphIds.has(msg.id)) {
                await markEmailAsRead(msg.id, accessToken);
                continue;
            }

            processedGraphIds.add(msg.id);
            await ticketService.createTicketFromEmail(emailData);
            await markEmailAsRead(msg.id, accessToken);
        }
    } catch (err) {
        logger.error(`[EMAIL] Fetch Error: ${err.message}`);
    } finally {
        isPolling = false;
    }
};

const startImapListener = () => {
    logger.info('[EMAIL] Starting Graph API Poller...');
    fetchNewGraphEmails();
    if (!graphPollInterval) {
        graphPollInterval = setInterval(fetchNewGraphEmails, 30000);
    }
};

module.exports = { sendEmail, sendAgentReplyEmail, startImapListener };
