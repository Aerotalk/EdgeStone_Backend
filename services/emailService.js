const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');

// --- Sender (Zoho Mail SMTP) ---
// Create fresh transporter for each email to avoid stale connections on Railway/Render
const createTransporter = () => {
    // Log effective SMTP config (without password) to debug production issues
    logger.debug(`SMTP config in use: host=${emailConfig.smtp.host}, port=${emailConfig.smtp.port}, secure=${emailConfig.smtp.secure}, requireTLS=${emailConfig.smtp.requireTLS}, user=${emailConfig.smtp.auth && emailConfig.smtp.auth.user}`);
    return nodemailer.createTransport(emailConfig.smtp);
};

const sendEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    // Create a fresh transporter for this email
    const transporter = createTransporter();

    try {
        // Verify connection before sending (helps catch issues early)
        await transporter.verify();
        logger.info('✅ SMTP connection verified');

        const mailOptions = {
            from: `"${emailConfig.addresses.noReply}" <${emailConfig.addresses.noReply}>`,
            to,
            subject,
            text,
            html,
        };

        // Add email threading headers if provided
        if (inReplyTo || references) {
            mailOptions.headers = {};
            if (inReplyTo) {
                mailOptions.headers['In-Reply-To'] = inReplyTo;
            }
            if (references) {
                mailOptions.headers['References'] = references;
            }
        }

        const info = await transporter.sendMail(mailOptions);
        logger.info(`📧 Email sent successfully via SMTP: ${info.messageId} to ${to}`);

        // Close the connection after sending
        transporter.close();

        return info;
    } catch (error) {
        logger.error(`❌ Error sending email: ${error.message}`, { stack: error.stack });
        transporter.close(); // Ensure connection is closed even on error
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
