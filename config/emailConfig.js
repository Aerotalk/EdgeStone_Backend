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
        service: 'Zoho',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        logger: true,
        debug: true,
    },

    // System Email Addresses
    addresses: {
        support: 'support@edgestone.in', // Main support inbox
        noReply: process.env.MAIL_USER, // Must match authenticated SMTP user for Zoho
    }
};
