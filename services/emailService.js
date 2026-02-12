const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const emailConfig = require('../config/emailConfig');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');

// --- Sender (Zepto Mail SMTP) ---
const transporter = nodemailer.createTransport(emailConfig.smtp);

const sendEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    try {
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
        return info;
    } catch (error) {
        logger.error(`❌ Error sending email: ${error.message}`, { stack: error.stack });
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
    logger.debug(`🔍 Searching for UNSEEN messages...`);

    imap.search(['UNSEEN'], (err, results) => {
        if (err) {
            logger.error(`❌ IMAP Search Error: ${err.message}`, { stack: err.stack });
            return;
        }

        if (!results || !results.length) {
            logger.info('📭 No unseen messages found.');
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
