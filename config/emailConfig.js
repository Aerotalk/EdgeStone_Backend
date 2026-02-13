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
        host: process.env.SMTP_HOST || 'smtp.zoho.com', // Use generic endpoint
        port: process.env.SMTP_PORT || 587,
        secure: false, // TLS (STARTTLS)
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        // ROBUST CONFIG: No pooling, long timeouts, IPv4
        connectionTimeout: 60000, // 60s
        greetingTimeout: 30000, // 30s
        socketTimeout: 60000, // 60s
        logger: true,
        debug: true,
        tls: {
            rejectUnauthorized: false
        },
        family: 4 // Force IPv4
    },

    // System Email Addresses
    addresses: {
        support: 'support@edgestone.in', // Main support inbox
        noReply: process.env.MAIL_USER, // Must match authenticated SMTP user for Zoho
    }
};
