const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');
const { SendMailClient } = require('zeptomail');

// ─────────────────────────────────────────────────────────────────────────────
// ZeptoMail Client — single instance, validates token at startup
// ─────────────────────────────────────────────────────────────────────────────
if (!process.env.ZEPTO_MAIL_TOKEN) {
    logger.error('🚨 ZEPTO_MAIL_TOKEN is not set! Outgoing emails will fail. Check .env / .env.production');
}
if (!process.env.ZEPTO_FROM_EMAIL) {
    logger.warn('⚠️ ZEPTO_FROM_EMAIL is not set. Defaulting to noreply@edgestone.in');
}

const ZEPTO_FROM = process.env.ZEPTO_FROM_EMAIL || 'noreply@edgestone.in';
const ZEPTO_NAME = 'EdgeStone Support';
const ZEPTO_URL = process.env.ZEPTO_API_URL || 'https://api.zeptomail.in/v1.1/email';
const ZEPTO_TOKEN = process.env.ZEPTO_MAIL_TOKEN || '';

const zeptoClient = ZEPTO_TOKEN
    ? new SendMailClient({ url: ZEPTO_URL, token: ZEPTO_TOKEN })
    : null;

// ─────────────────────────────────────────────────────────────────────────────
// Helper — extract a human-readable message from any ZeptoMail SDK rejection.
// The SDK rejects with plain strings (validation) or raw JSON objects (API errors).
// ─────────────────────────────────────────────────────────────────────────────
const extractZeptoError = (err) => {
    if (!err) return 'Unknown error (null)';
    if (typeof err === 'string') return err;
    if (typeof err === 'object') {
        return (
            err?.error?.details?.[0]?.sub_message ||
            err?.error?.details?.[0]?.message ||
            err?.error?.message ||
            err?.message ||
            JSON.stringify(err?.error || err)
        );
    }
    return String(err);
};

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
// Validates inputs, guards against missing client, retries on transient failures.
// ─────────────────────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
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

    logger.info(`📧 Sending email via ZeptoMail | to: ${to} | subject: "${safeSubject}"`);

    if (!zeptoClient) {
        const msg = '🚨 ZeptoMail client is not initialised (ZEPTO_MAIL_TOKEN missing). Cannot send email.';
        logger.error(msg);
        throw new Error(msg);
    }

    return withRetry(
        () => sendViaZepto({ to, subject: safeSubject, html, text }),
        { retries: 2, delayMs: 2000, label: 'ZeptoMail send' }
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// sendViaZepto — builds and dispatches the ZeptoMail payload.
// NOTE: ZeptoMail API rejects any unrecognised keys (e.g. custom `headers`).
//       In-Reply-To / References are intentionally OMITTED — ZeptoMail does not
//       support them. Use sendAgentReplyEmail (→ Zoho Mail OAuth) for threading.
// ─────────────────────────────────────────────────────────────────────────────
const sendViaZepto = async ({ to, subject, html, text }) => {
    const payload = {
        from: {
            address: ZEPTO_FROM,
            name: ZEPTO_NAME,
        },
        to: [
            {
                email_address: {
                    address: to,
                    name: to,   // Name is optional; use address as fallback
                },
            },
        ],
        subject,
        // ZeptoMail requires at least one of htmlbody / textbody.
        // Always provide both for maximum client compatibility.
        htmlbody: html || `<p>${text}</p>`,
        textbody: text || '',
    };

    logger.debug(`📤 ZeptoMail payload ready | from: ${ZEPTO_FROM} | to: ${to}`);

    try {
        const response = await zeptoClient.sendMail(payload);
        logger.info(`✅ ZeptoMail sent successfully | to: ${to} | response: ${JSON.stringify(response)}`);
        return response;
    } catch (err) {
        const errMsg = extractZeptoError(err);
        const rawDump = typeof err === 'string' ? err : JSON.stringify(err);
        logger.error(`❌ ZeptoMail API error: ${errMsg}`);
        logger.error(`❌ ZeptoMail raw dump:  ${rawDump}`);
        throw new Error(`ZeptoMail: ${errMsg}`);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// IMAP Listener — Zoho incoming mail
// Handles: reconnect on ANY error/close, null-safe parsing, duplicate suppression
// ─────────────────────────────────────────────────────────────────────────────

// Track recently processed messageIds to avoid processing the same email twice
// (can happen if IMAP reconnects while a fetch is in-flight)
const processedMessageIds = new Set();
const PROCESSED_ID_TTL_MS = 30 * 60 * 1000; // 30 minutes

const rememberProcessed = (messageId) => {
    if (!messageId) return;
    processedMessageIds.add(messageId);
    // Auto-clean after TTL
    setTimeout(() => processedMessageIds.delete(messageId), PROCESSED_ID_TTL_MS);
};

let imapReconnectTimer = null;

const scheduleImapReconnect = (delayMs = 15000) => {
    if (imapReconnectTimer) return; // already scheduled
    logger.warn(`⚠️ IMAP reconnecting in ${delayMs / 1000}s...`);
    imapReconnectTimer = setTimeout(() => {
        imapReconnectTimer = null;
        startImapListener();
    }, delayMs);
};

const startImapListener = () => {
    logger.info('🔌 Starting IMAP Listener...');
    let imap;

    try {
        imap = new Imap(emailConfig.imap);
    } catch (err) {
        logger.error(`❌ Failed to create IMAP client: ${err.message}`);
        scheduleImapReconnect(30000);
        return;
    }

    imap.once('ready', () => {
        logger.info('✅ IMAP Connection Ready');
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                logger.error(`❌ Error opening inbox: ${err.message}`);
                imap.end();
                scheduleImapReconnect();
                return;
            }
            logger.info('📥 Inbox open. Listening for new emails...');

            // Initial scan for any unread emails that arrived while we were offline
            fetchNewEmails(imap, 'startup');

            imap.on('mail', (numNewMsgs) => {
                logger.info(`📨 ${numNewMsgs} new message(s) arrived`);
                fetchNewEmails(imap, `mail-event(${numNewMsgs})`);
            });

            // Periodic keepalive: re-scan every 5 minutes in case mail events were missed
            const keepaliveInterval = setInterval(() => {
                if (!imap || imap.state === 'disconnected') {
                    clearInterval(keepaliveInterval);
                    return;
                }
                fetchNewEmails(imap, 'keepalive');
            }, 5 * 60 * 1000);

            imap.once('close', () => clearInterval(keepaliveInterval));
            imap.once('end', () => clearInterval(keepaliveInterval));
        });
    });

    imap.once('error', (err) => {
        logger.error(`❌ IMAP Error [${err.code || 'unknown'}]: ${err.message}`);
        scheduleImapReconnect();
    });

    imap.once('end', () => {
        logger.warn('⚠️ IMAP connection ended');
        scheduleImapReconnect();
    });

    imap.once('close', (hadError) => {
        logger.warn(`⚠️ IMAP connection closed${hadError ? ' (with error)' : ''}`);
        scheduleImapReconnect();
    });

    try {
        imap.connect();
    } catch (err) {
        logger.error(`❌ imap.connect() threw synchronously: ${err.message}`);
        scheduleImapReconnect(30000);
    }
};

const fetchNewEmails = (imap, trigger) => {
    if (!imap || imap.state === 'disconnected') {
        logger.warn(`⚠️ fetchNewEmails(${trigger}): IMAP is disconnected — skipping`);
        return;
    }

    logger.info(`🔍 Searching UNSEEN messages [trigger: ${trigger}]...`);

    imap.search(['UNSEEN'], (err, results) => {
        if (err) {
            logger.error(`❌ IMAP search error: ${err.message}`);
            return;
        }

        if (!results || results.length === 0) {
            logger.info('📭 No unseen messages');
            return;
        }

        logger.info(`📬 Found ${results.length} unseen message(s). Fetching...`);

        let fetchObj;
        try {
            fetchObj = imap.fetch(results, { bodies: '', markSeen: true });
        } catch (fetchErr) {
            logger.error(`❌ imap.fetch() failed: ${fetchErr.message}`);
            return;
        }

        fetchObj.on('message', (msg) => {
            msg.on('body', (stream) => {
                simpleParser(stream, async (parseErr, parsed) => {
                    if (parseErr) {
                        logger.error(`❌ Mail parse error: ${parseErr.message}`);
                        return;
                    }

                    // ── Null-safe field extraction ────────────────────────────
                    const messageId = parsed?.messageId || null;
                    const fromObj = parsed?.from?.value?.[0];

                    if (!fromObj || !fromObj.address) {
                        logger.warn(`⚠️ Skipping email with no parseable From address (messageId: ${messageId})`);
                        return;
                    }

                    // ── Skip emails from our own domain (auto-reply loops / sent copies) ──
                    const ownDomain = '@edgestone.in';
                    if (fromObj.address.toLowerCase().endsWith(ownDomain)) {
                        logger.info(`🔁 Skipping email from own domain (${fromObj.address}) — not a client email`);
                        return;
                    }

                    // ── Duplicate suppression ─────────────────────────────────
                    if (messageId && processedMessageIds.has(messageId)) {
                        logger.warn(`⚠️ Skipping duplicate email: ${messageId}`);
                        return;
                    }
                    rememberProcessed(messageId);

                    const emailData = {
                        from: fromObj.address,
                        fromName: fromObj.name || fromObj.address,
                        subject: parsed.subject || '(No Subject)',
                        body: parsed.text || parsed.html || '',
                        html: parsed.html || null,
                        date: parsed.date || new Date(),
                        messageId,
                        // Threading headers — used to detect if this is a reply to an existing ticket
                        inReplyTo: parsed.inReplyTo || null,
                        references: parsed.references || null,
                        attachments: parsed.attachments || [],
                    };

                    const recipient = parsed?.to?.text || 'unknown';
                    logger.info(`📩 Email received | from: ${emailData.from} | to: ${recipient} | subject: "${emailData.subject}"`);

                    try {
                        await ticketService.createTicketFromEmail(emailData);
                    } catch (e) {
                        logger.error(`❌ Error creating ticket from email: ${e.message}`, { stack: e.stack });
                    }
                });
            });
        });

        fetchObj.once('error', (fetchErr) => {
            logger.error(`❌ IMAP fetch stream error: ${fetchErr.message}`);
        });

        fetchObj.once('end', () => {
            logger.info('✅ Finished fetching unseen messages');
        });
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// sendAgentReplyEmail — sends an agent reply via Zoho Mail OAuth API.
// Unlike ZeptoMail, the Zoho Mail API supports In-Reply-To / References headers,
// which allows email clients (Gmail, Outlook) to thread the reply correctly.
//
// Use this ONLY for agent-initiated replies (not auto-replies — those use sendEmail).
// ─────────────────────────────────────────────────────────────────────────────
const sendAgentReplyEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    const zohoMailService = require('./zohoMailService');

    if (!to || typeof to !== 'string' || !to.includes('@')) {
        throw new Error(`sendAgentReplyEmail: invalid "to" address: ${to}`);
    }
    if (!subject || !subject.trim()) {
        throw new Error('sendAgentReplyEmail: subject cannot be empty');
    }

    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').trim();
    logger.info(`📧 Routing agent reply via Zoho Mail OAuth | to: ${to} | subject: "${safeSubject}"`);

    return zohoMailService.sendZohoEmail({ to, subject: safeSubject, html, text, inReplyTo, references });
};

module.exports = {
    sendEmail,
    sendAgentReplyEmail,
    startImapListener,
};
