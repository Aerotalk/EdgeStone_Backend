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
        authTimeout: 60000, // Increased from 30s to 60s
        connTimeout: 60000, // Connection timeout
        keepalive: {
            interval: 10000, // Send keepalive every 10s
            idleInterval: 300000, // IDLE for 5 minutes
            forceNoop: true
        }
    },


    // Zoho Mail SMTP Configuration (Outgoing)
    // Using port 587 with STARTTLS for better Railway compatibility
    smtp: {
        host: process.env.SMTP_HOST || 'smtppro.zoho.in',
        port: process.env.SMTP_PORT || 587, // Changed from 465 to 587
        secure: false, // Use STARTTLS instead of SSL
        requireTLS: true, // Force TLS upgrade
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        connectionTimeout: 60000, // Increased from 10s to 60s
        greetingTimeout: 30000,   // Increased from 5s to 30s
        socketTimeout: 60000,     // Increased from 10s to 60s
        logger: true,
        debug: true,
    },

    // System Email Addresses
    addresses: {
        support: 'support@edgestone.in', // Main support inbox
        noReply: process.env.MAIL_USER, // Must match authenticated SMTP user for Zoho
    }
};
