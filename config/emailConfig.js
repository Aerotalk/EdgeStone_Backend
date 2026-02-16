const dotenv = require('dotenv');
dotenv.config();

// Normalize SMTP configuration to avoid mismatches between port and TLS mode.
// - Port 587  → STARTTLS (secure: false, requireTLS: true)
// - Port 465  → Implicit TLS (secure: true, requireTLS: false)
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpSecure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : smtpPort === 465;

module.exports = {
    // Zoho Mail IMAP Configuration (Incoming)
    imap: {
        user: process.env.MAIL_USER,
        password: process.env.MAIL_PASSWORD,
        host: process.env.IMAP_HOST || 'imappro.zoho.in',
        port: Number(process.env.IMAP_PORT) || 993,
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
    // Defaults to port 587 with STARTTLS, but safely supports 465 + implicit TLS.
    smtp: {
        host: process.env.SMTP_HOST || 'smtppro.zoho.in',
        port: smtpPort,
        secure: smtpSecure,
        // Only force STARTTLS when we are not already using implicit TLS (secure: true)
        requireTLS: !smtpSecure,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        connectionTimeout: 120000, // Increased to 120s for Railway's slow network
        greetingTimeout: 60000,    // Increased to 60s
        socketTimeout: 120000,     // Increased to 120s
        logger: true,
        debug: true,
    },

    // System Email Addresses
    addresses: {
        support: 'support@edgestone.in', // Main support inbox
        noReply: process.env.MAIL_USER, // Must match authenticated SMTP user for Zoho
    }
};
