const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    // Zoho Mail IMAP Configuration (Incoming)
    imap: {
        user: process.env.MAIL_USER,
        password: process.env.MAIL_PASSWORD,
        host: process.env.IMAP_HOST || 'imappro.zoho.in',
        port: process.env.IMAP_PORT || 993,
        tls: process.env.IMAP_SECURE === 'true',
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 30000,
    },


    // Zoho Mail SMTP Configuration (Outgoing)
    smtp: {
        host: process.env.SMTP_HOST || 'smtppro.zoho.in',
        port: process.env.SMTP_PORT || 587,
        secure: String(process.env.SMTP_SECURE) === 'true', // Ensure boolean
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        // Debugging & Timeouts to fix Connection Timeout
        connectionTimeout: 10000, // Fixed typo "const" -> "connectionTimeout"
        socketTimeout: 20000,
        logger: true,
        debug: true,
        tls: {
            rejectUnauthorized: false
        },
        family: 4 // Force IPv4 to avoid potential IPv6 routing issues on Railway
    },

    // System Email Addresses
    addresses: {
        support: 'support@edgestone.in', // Main support inbox
        noReply: process.env.MAIL_USER, // Must match authenticated SMTP user for Zoho
    }
};
