'use strict';

/**
 * zohoMailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends emails via the Zoho Mail REST API (India region: mail.zoho.in).
 * Unlike ZeptoMail, Zoho Mail API supports proper reply-in-thread via its
 * native "action: reply" endpoint — ensuring email threading in Gmail/Outlook.
 *
 * THREADING STRATEGY:
 *   1. Look up the client's original email in Zoho using the RFC Message-ID header
 *   2. If found → use Zoho's "reply" action (POST /messages/{zohoMsgId})
 *   3. If not found → fall back to sending a regular email with subject "Re: ..."
 *
 * Used exclusively for AGENT REPLIES (not auto-replies — those stay on ZeptoMail).
 *
 * Required .env vars:
 *   ZOHO_ACCESS_TOKEN    – OAuth access token (expires every 1 hour)
 *   ZOHO_REFRESH_TOKEN   – Used to auto-refresh the access token
 *   ZOHO_CLIENT_ID       – From Zoho API Console (Server-based application)
 *   ZOHO_CLIENT_SECRET   – From Zoho API Console
 *   ZOHO_FROM_EMAIL      – The "from" address (must match the OAuth-authorised account)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const https = require('https');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Config — read once at startup
// ─────────────────────────────────────────────────────────────────────────────
const ZOHO_FROM_EMAIL = process.env.ZOHO_FROM_EMAIL || 'marketing@edgestone.in';
const ZOHO_FROM_NAME = 'EdgeStone Support';
// Zoho Mail REST API for India DC lives at mail.zoho.in
const ZOHO_MAIL_BASE = 'https://mail.zoho.in';
const ZOHO_TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token';

// Mutable token — auto-refreshed on 401
let zohoAccessToken = process.env.ZOHO_ACCESS_TOKEN || '';

// Cached Zoho account ID (fetched once per process lifetime)
let zohoAccountId = null;

// ─────────────────────────────────────────────────────────────────────────────
// Validate required config at startup
// ─────────────────────────────────────────────────────────────────────────────
const missingVars = ['ZOHO_ACCESS_TOKEN', 'ZOHO_REFRESH_TOKEN', 'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET']
    .filter(v => !process.env[v]);

if (missingVars.length > 0) {
    logger.error(`🚨 zohoMailService: Missing env vars: ${missingVars.join(', ')}. Agent reply emails will fail.`);
} else {
    logger.info('✅ zohoMailService: Zoho OAuth credentials loaded successfully.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — minimal HTTPS request wrapper (no extra deps)
// ─────────────────────────────────────────────────────────────────────────────
const httpsRequest = (url, options, body = null) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOpts = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            ...options,
        };
        const req = https.request(reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// refreshAccessToken — refreshes via REFRESH_TOKEN grant
// ─────────────────────────────────────────────────────────────────────────────
const refreshAccessToken = async () => {
    logger.info('🔄 zohoMailService: Refreshing Zoho access token...');

    const postBody = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ZOHO_CLIENT_ID || '',
        client_secret: process.env.ZOHO_CLIENT_SECRET || '',
        refresh_token: process.env.ZOHO_REFRESH_TOKEN || '',
    }).toString();

    const result = await httpsRequest(ZOHO_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postBody),
        },
    }, postBody);

    if (result.status !== 200 || !result.body?.access_token) {
        const detail = typeof result.body === 'object' ? JSON.stringify(result.body) : result.body;
        throw new Error(`Zoho token refresh failed (HTTP ${result.status}): ${detail}`);
    }

    zohoAccessToken = result.body.access_token;
    logger.info('✅ zohoMailService: Access token refreshed successfully.');
    return zohoAccessToken;
};

// ─────────────────────────────────────────────────────────────────────────────
// authHeaders — returns current Authorization headers
// ─────────────────────────────────────────────────────────────────────────────
const authHeaders = (extra = {}) => ({
    Authorization: `Zoho-oauthtoken ${zohoAccessToken}`,
    'Content-Type': 'application/json',
    ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// getAccountId — fetches and caches the primary Zoho Mail account ID
// ─────────────────────────────────────────────────────────────────────────────
const getAccountId = async () => {
    if (zohoAccountId) return zohoAccountId;

    logger.info('🔍 zohoMailService: Fetching Zoho Mail account ID...');
    const url = `${ZOHO_MAIL_BASE}/api/accounts`;
    const result = await httpsRequest(url, { method: 'GET', headers: authHeaders() });

    if (!result.body?.data?.[0]?.accountId) {
        throw new Error(`Failed to fetch Zoho account ID. Response: ${JSON.stringify(result.body)}`);
    }

    zohoAccountId = result.body.data[0].accountId;
    logger.info(`✅ zohoMailService: Account ID resolved: ${zohoAccountId}`);
    return zohoAccountId;
};

// ─────────────────────────────────────────────────────────────────────────────
// findZohoMessageId — searches Zoho INBOX for an email matching the given
// RFC Message-ID header (the one stored in ticket.messageId).
// Returns the Zoho internal message ID string, or null if not found.
// ─────────────────────────────────────────────────────────────────────────────
const findZohoMessageId = async (accountId, rfcMessageId) => {
    if (!rfcMessageId) return null;

    // Zoho Mail search: search for the message-id header value in the inbox
    const searchQuery = encodeURIComponent(`messageId:${rfcMessageId}`);
    const url = `${ZOHO_MAIL_BASE}/api/accounts/${accountId}/messages/search?searchKey=${searchQuery}&limit=1`;

    logger.info(`🔍 zohoMailService: Searching Zoho for original message | query: messageId:${rfcMessageId}`);
    const result = await httpsRequest(url, { method: 'GET', headers: authHeaders() });

    const msgs = result.body?.data;
    if (Array.isArray(msgs) && msgs.length > 0) {
        const zohoMsgId = msgs[0].messageId;
        logger.info(`✅ zohoMailService: Found Zoho message ID: ${zohoMsgId}`);
        return zohoMsgId;
    }

    logger.warn(`⚠️ zohoMailService: Original message not found in Zoho Inbox (rfcMsgId: ${rfcMessageId}). Will fall back to new send.`);
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// sendReplyAction — replies to a specific Zoho message (true thread reply)
// POST /api/accounts/{accountId}/messages/{messageId}?action=reply
// ─────────────────────────────────────────────────────────────────────────────
const sendReplyAction = async (accountId, zohoMsgId, { to, subject, html, text }) => {
    const url = `${ZOHO_MAIL_BASE}/api/accounts/${accountId}/messages/${zohoMsgId}`;

    const payload = {
        action: 'reply',
        fromAddress: ZOHO_FROM_EMAIL,
        toAddress: to,
        subject: subject,
        content: html || `<p>${text || ''}</p>`,
        mailFormat: 'html',
    };

    const bodyStr = JSON.stringify(payload);
    const result = await httpsRequest(url, {
        method: 'POST',
        headers: authHeaders({ 'Content-Length': Buffer.byteLength(bodyStr) }),
    }, bodyStr);

    if (result.status < 200 || result.status >= 300) {
        throw new Error(`Zoho reply-action failed (HTTP ${result.status}): ${JSON.stringify(result.body)}`);
    }

    logger.info(`✅ zohoMailService: Reply-in-thread sent | zohoMsgId: ${zohoMsgId} | to: ${to}`);
    return result.body;
};

// ─────────────────────────────────────────────────────────────────────────────
// sendNewMessage — fallback: sends a regular email (not in-thread)
// Used when the original message can't be found in Zoho Inbox
// ─────────────────────────────────────────────────────────────────────────────
const sendNewMessage = async (accountId, { to, subject, html, text }) => {
    const url = `${ZOHO_MAIL_BASE}/api/accounts/${accountId}/messages`;

    const payload = {
        fromAddress: ZOHO_FROM_EMAIL,
        toAddress: to,
        subject: subject,
        content: html || `<p>${text || ''}</p>`,
        mailFormat: 'html',
    };

    const bodyStr = JSON.stringify(payload);
    const result = await httpsRequest(url, {
        method: 'POST',
        headers: authHeaders({ 'Content-Length': Buffer.byteLength(bodyStr) }),
    }, bodyStr);

    if (result.status < 200 || result.status >= 300) {
        throw new Error(`Zoho send failed (HTTP ${result.status}): ${JSON.stringify(result.body)}`);
    }

    logger.info(`✅ zohoMailService: New message sent (fallback) | to: ${to}`);
    return result.body;
};

// ─────────────────────────────────────────────────────────────────────────────
// withTokenRetry — executes fn; on 401, refreshes token and retries once.
// ─────────────────────────────────────────────────────────────────────────────
const withTokenRetry = async (fn) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const is401 = err.message?.includes('HTTP 401');
            if (is401 && attempt === 1) {
                logger.warn('⚠️ zohoMailService: 401 — refreshing token and retrying...');
                zohoAccountId = null; // bust ID cache too
                await refreshAccessToken();
                continue;
            }
            throw err;
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// sendZohoEmail — main public API
//
// Attempts to send a threaded reply via Zoho's native reply action.
// Falls back to a regular send if the original message isn't in Zoho Inbox.
// ─────────────────────────────────────────────────────────────────────────────
const sendZohoEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    if (!to || !subject) {
        throw new Error('zohoMailService.sendZohoEmail: "to" and "subject" are required.');
    }
    if (!zohoAccessToken) {
        throw new Error('zohoMailService: ZOHO_ACCESS_TOKEN is not set. Cannot send email.');
    }

    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').trim();
    logger.info(`📧 zohoMailService: Preparing agent reply | to: ${to} | subject: "${safeSubject}"`);

    return withTokenRetry(async () => {
        const accountId = await getAccountId();
        const zohoMsgId = await findZohoMessageId(accountId, inReplyTo);

        if (zohoMsgId) {
            // True threaded reply via Zoho's reply-action endpoint
            logger.info(`🧵 zohoMailService: Using reply-action for threading | zohoMsgId: ${zohoMsgId}`);
            return sendReplyAction(accountId, zohoMsgId, { to, subject: safeSubject, html, text });
        } else {
            // Fallback: send as new message (subject already prefixed with "Re:" by caller)
            logger.warn('⚠️ zohoMailService: Falling back to new-message send (no Zoho msgId found).');
            return sendNewMessage(accountId, { to, subject: safeSubject, html, text });
        }
    });
};

module.exports = { sendZohoEmail, refreshAccessToken };
