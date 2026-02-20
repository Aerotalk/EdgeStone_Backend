const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');
const { Resend } = require('resend');
const { SendMailClient } = require('zeptomail');

// --- ZeptoMail Configuration ---
const zeptoClient = process.env.ZEPTO_MAIL_TOKEN ? new SendMailClient({
    url: process.env.ZEPTO_API_URL || "https://api.zeptomail.in/v1.1/email",
    token: process.env.ZEPTO_MAIL_TOKEN,
}) : null;

// --- Resend Configuration ---
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- Sender (Zoho Mail SMTP Pool) ---
// Create fresh transporter for each email to avoid stale connections
const createTransporter = () => {
    logger.debug(`SMTP config in use: host=${emailConfig.smtp.host}, port=${emailConfig.smtp.port}, secure=${emailConfig.smtp.secure}, user=${emailConfig.smtp.auth && emailConfig.smtp.auth.user}`);
    return nodemailer.createTransport(emailConfig.smtp);
};

/**
 * sendEmail — Primary email dispatch.
 * Provider priority (controlled by EMAIL_PROVIDER env var):
 *   1. zepto  → ZeptoMail HTTP API  (default — works on any VPS, no port restrictions)
 *   2. resend → Resend HTTP API     (fallback if zepto is unavailable)
 *   3. smtp   → Zoho SMTP           (only use if both API providers fail/unavailable)
 *
 * Auto-fallback: if the chosen provider fails, the next available one is tried automatically.
 */
const sendEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    // Default to 'zepto' — SMTP is blocked on most VPS providers (port 465/587)
    const provider = (process.env.EMAIL_PROVIDER || 'zepto').toLowerCase().trim();
    logger.info(`📧 Sending email — provider: ${provider.toUpperCase()} | to: ${to} | subject: "${subject}"`);

    // Build ordered provider list based on config
    const providerOrder = [];

    if (provider === 'zepto') {
        if (zeptoClient) providerOrder.push('zepto');
        if (resend) providerOrder.push('resend');
        providerOrder.push('smtp');
    } else if (provider === 'resend') {
        if (resend) providerOrder.push('resend');
        if (zeptoClient) providerOrder.push('zepto');
        providerOrder.push('smtp');
    } else {
        // smtp first, then HTTP fallbacks
        providerOrder.push('smtp');
        if (zeptoClient) providerOrder.push('zepto');
        if (resend) providerOrder.push('resend');
    }

    const args = { to, subject, html, text, inReplyTo, references };
    let lastError;

    for (const p of providerOrder) {
        try {
            if (p === 'zepto') {
                if (!zeptoClient) { logger.warn('⚠️ ZeptoMail token missing — skipping'); continue; }
                return await sendViaZepto(args);
            } else if (p === 'resend') {
                if (!resend) { logger.warn('⚠️ Resend API key missing — skipping'); continue; }
                return await sendViaResend(args);
            } else {
                return await sendViaSMTP(args);
            }
        } catch (err) {
            logger.error(`❌ Provider "${p.toUpperCase()}" failed: ${err.message}`);
            lastError = err;
            logger.warn(`⚠️ Trying next provider in fallback chain...`);
        }
    }

    // All providers exhausted
    logger.error(`🚨 All email providers failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('All email providers failed');
};


const sendViaZepto = async ({ to, subject, html, text, inReplyTo, references }) => {
    try {
        const payload = {
            from: {
                address: process.env.ZEPTO_FROM_EMAIL || 'noreply@edgestone.in',
                name: "EdgeStone Support"
            },
            to: [
                {
                    email_address: {
                        address: to,
                        name: to // Ideally should be name, but using email if name logic is complex
                    }
                }
            ],
            subject: subject,
            htmlbody: html,
            textbody: text,
        };

        // ZeptoMail header support is different, check documentation if needed.
        // For now, basic headers if library supports them as 'headers' in payload.
        // SendMailClient payload structure: { from, to, subject, htmlbody, textbody, track_clicks, track_opens, headers }

        const headers = {};
        if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
        if (references) headers['References'] = references;
        if (Object.keys(headers).length > 0) payload.headers = headers;

        logger.info(`📤 Sending email via ZeptoMail to: ${to} | Subject: "${subject}"`);

        const response = await zeptoClient.sendMail(payload);

        logger.info(`✅ Email sent successfully via ZeptoMail. Response: ${JSON.stringify(response)}`);
        return response;

    } catch (err) {
        logger.error(`❌ ZeptoMail Failed: ${err.message}`, { stack: err.stack });
        throw err;
    }
}


const sendViaResend = async ({ to, subject, html, text, inReplyTo, references }) => {
    try {
        const payload = {
            from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
            to,
            subject,
            html,
            text
        };

        if (process.env.RESEND_REPLY_TO) {
            payload.reply_to = process.env.RESEND_REPLY_TO;
        }

        const headers = {};
        if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
        if (references) headers['References'] = references;
        if (Object.keys(headers).length > 0) payload.headers = headers;

        logger.info(`📤 Sending email via Resend to: ${to} | Subject: "${subject}"`);
        const { data, error } = await resend.emails.send(payload);

        if (error) {
            logger.error(`❌ Resend API Error: ${error.message}`);
            throw new Error(error.message);
        }

        logger.info(`✅ Email sent successfully via Resend: ${data.id}`);
        return data;
    } catch (err) {
        logger.error(`❌ Resend Failed: ${err.message}`, { stack: err.stack });
        throw err;
    }
}

const sendViaSMTP = async ({ to, subject, html, text, inReplyTo, references }) => {
    const transporter = createTransporter();

    try {
        // Verify connection first (with short timeout)
        await Promise.race([
            transporter.verify(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP Verify Timeout')), 10000))
        ]);

        logger.info(`📤 Sending email via SMTP to: ${to} | Subject: "${subject}"`);

        const mailOptions = {
            from: `"${emailConfig.addresses.noReply}" <${emailConfig.addresses.noReply}>`,
            to,
            subject,
            text,
            html,
            headers: {}
        };

        if (inReplyTo) mailOptions.headers['In-Reply-To'] = inReplyTo;
        if (references) mailOptions.headers['References'] = references;

        const info = await transporter.sendMail(mailOptions);
        logger.info(`✅ Email sent successfully via SMTP: ${info.messageId}`);
        transporter.close(); // Clean up connection
        return info;

    } catch (error) {
        logger.error(`❌ SMTP Failed: ${error.message}`, { stack: error.stack });

        // Critical Error Analysis
        if (error.code === 'ETIMEDOUT') {
            logger.error('⚠️ FATAL: Railway blocked Port 465/587. SMTP is not possible.');
        }

        transporter.close();
        throw error;
    }
};

// --- Listener (Zoho IMAP) ---
const startImapListener = () => {
    logger.info('🔌 Starting IMAP Listener...');
    const imap = new Imap(emailConfig.imap);

    imap.once('ready', () => {
        logger.info('✅ IMAP Connection Ready');
        openInbox(imap, (err, box) => {
            if (err) {
                logger.error(`❌ Error opening inbox: ${err.message}`, { stack: err.stack });
                throw err;
            }
            logger.info('📥 Inbox Open. Waiting for new emails...');

            // CRITICAL FIX: Check for existing UNSEEN emails first
            logger.info('🔍 Performing initial check for existing unread emails...');
            fetchNewEmails(imap, 0); // Check for any existing UNSEEN emails

            // Then listen for new emails that arrive after connection
            imap.on('mail', (numNewMsgs) => {
                logger.info(`📨 ${numNewMsgs} new messages received`);
                fetchNewEmails(imap, numNewMsgs);
            });
        });
    });

    imap.once('error', (err) => {
        logger.error(`❌ IMAP Error: ${err.message}`, { stack: err.stack });
        // Retry logic: Wait 10s then reconnect
        if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
            logger.warn('⚠️ IMAP Connection lost. Retrying in 10s...');
            setTimeout(startImapListener, 10000);
        }
    });

    imap.once('end', () => {
        logger.warn('⚠️ IMAP Connection Ended');
        setTimeout(startImapListener, 10000);
    });

    imap.connect();
};

const openInbox = (imap, cb) => {
    imap.openBox('INBOX', false, cb);
};

const fetchNewEmails = (imap, count) => {
    logger.info(`🔍 Searching for UNSEEN messages... (Triggered by ${count} new message(s))`);

    imap.search(['UNSEEN'], (err, results) => {
        if (err) {
            logger.error(`❌ IMAP Search Error: ${err.message}`, { stack: err.stack });
            return;
        }

        // Enhanced logging to debug the issue
        logger.info(`🔎 Search completed. Raw results: ${JSON.stringify(results)}`);
        logger.info(`🔎 Results type: ${typeof results}, Is Array: ${Array.isArray(results)}, Length: ${results ? results.length : 'null'}`);

        if (!results || !results.length) {
            logger.warn('📭 No unseen messages found despite "mail" event firing!');
            logger.warn('⚠️ This suggests emails are being marked as READ before we can process them.');
            logger.warn('⚠️ Possible causes: Another email client is connected, or Zoho web interface is open.');
            return;
        }

        logger.info(`📬 Found ${results.length} unseen messages. Fetching...`);

        const f = imap.fetch(results, {
            bodies: '', // Fetch entire body for parsing
            markSeen: true // Mark as read
        });

        f.on('message', (msg, seqno) => {
            msg.on('body', (stream, info) => {
                simpleParser(stream, async (err, parsed) => {
                    if (err) {
                        logger.error(`❌ Mail Parsing Error: ${err.message}`, { stack: err.stack });
                        return;
                    }

                    const emailData = {
                        from: parsed.from.value[0].address,
                        fromName: parsed.from.value[0].name,
                        subject: parsed.subject,
                        body: parsed.text || parsed.html,
                        html: parsed.html,
                        date: parsed.date,
                        messageId: parsed.messageId,
                        attachments: parsed.attachments
                    };

                    logger.info('🔥🔥🔥 PERMAN RECEIVED A MAIL 🔥🔥🔥');
                    logger.info(`📝 Parsed Email: "${emailData.subject}" from ${emailData.from} to ${parsed.to ? parsed.to.text : 'Unknown Recipient'}`);

                    try {
                        await ticketService.createTicketFromEmail(emailData);
                    } catch (e) {
                        logger.error(`❌ Error creating ticket from email: ${e.message}`, { stack: e.stack });
                    }
                });
            });
        });

        f.once('error', (err) => {
            logger.error(`❌ Fetch Error: ${err.message}`, { stack: err.stack });
        });

        f.once('end', () => {
            logger.info('✅ Done fetching new emails.');
        });
    });
};

module.exports = {
    sendEmail,
    startImapListener
};
