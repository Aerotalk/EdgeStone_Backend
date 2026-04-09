'use strict';

/**
 * outlookMailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends agent reply emails via Microsoft Outlook / Office 365 SMTP.
 * Unlike the Zoho integration which used a proprietary REST API, Outlook SMTP
 * supports standard threading out of the box using `In-Reply-To` and `References`.
 */

const nodemailer = require('nodemailer');
const emailConfig = require('../config/emailConfig');
const logger = require('../utils/logger');

// Retrieve SMTP user configured in config
const OUTLOOK_FROM_EMAIL = emailConfig.smtp.auth.user || process.env.MAIL_USER;

// Pre-flight check
if (!OUTLOOK_FROM_EMAIL || !emailConfig.smtp.auth.pass) {
    logger.error('🚨 outlookMailService: Missing MAIL_USER or MAIL_PASSWORD in environment. Agent replies will fail.');
}

// Create Nodemailer Transporter
const transporter = nodemailer.createTransport(emailConfig.smtp);

/**
 * Sends an email specifically designed to thread as a reply.
 */
const sendOutlookReplyEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    if (!to || !subject) {
        throw new Error('outlookMailService.sendOutlookReplyEmail: "to" and "subject" are required.');
    }

    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').trim();
    logger.info(`📧 outlookMailService: Preparing threaded agent reply | to: ${to} | subject: "${safeSubject}"`);

    // We build standard RFC 2822 threading headers
    const mailOptions = {
        from: `EdgeStone Support <${OUTLOOK_FROM_EMAIL}>`,
        to,
        subject: safeSubject,
        html: html || `<p>${text || ''}</p>`,
        text: text || '',
    };

    // If we have threading information, attach it
    if (inReplyTo) {
        mailOptions.inReplyTo = inReplyTo;
        logger.info(`🧵 outlookMailService: Adding In-Reply-To header: ${inReplyTo}`);
    }
    
    if (references) {
        mailOptions.references = references;
    } else if (inReplyTo) {
        // Fallback: If no previous references, use the direct parent
        mailOptions.references = inReplyTo;
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        logger.info(`✅ outlookMailService: Reply sent successfully | messageId: ${info.messageId} | to: ${to}`);
        return info;
    } catch (error) {
        logger.error(`❌ outlookMailService: Failed to send reply: ${error.message}`);
        throw error;
    }
};

/**
 * Sends a generic system email (auto-replies, notifications).
 * Does not attach threading headers (In-Reply-To/References).
 */
const sendOutlookEmail = async ({ to, subject, html, text, inReplyTo, references }) => {
    if (!to || !subject) {
        throw new Error('outlookMailService.sendOutlookEmail: "to" and "subject" are required.');
    }

    const safeSubject = subject.replace(/[\r\n\t]/g, ' ').trim();
    logger.info(`📧 outlookMailService: Preparing generic system email | to: ${to} | subject: "${safeSubject}"`);

    const mailOptions = {
        from: `EdgeStone Support <${OUTLOOK_FROM_EMAIL}>`,
        to,
        subject: safeSubject,
        html: html || `<p>${text || ''}</p>`,
        text: text || '',
    };

    if (inReplyTo) {
        mailOptions.inReplyTo = inReplyTo;
    }
    
    if (references) {
        mailOptions.references = references;
    } else if (inReplyTo) {
        mailOptions.references = inReplyTo;
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        logger.info(`✅ outlookMailService: System email sent successfully | messageId: ${info.messageId} | to: ${to}`);
        return info;
    } catch (error) {
        logger.error(`❌ outlookMailService: Failed to send system email: ${error.message}`);
        throw error;
    }
};

module.exports = { sendOutlookReplyEmail, sendOutlookEmail };
