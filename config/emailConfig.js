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
        // Force STARTTLS when using port 587 (not implicit TLS)
        requireTLS: !smtpSecure,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        // Enhanced TLS configuration for production environments
        tls: {
            // Ensure proper TLS handshake
            ciphers: 'SSLv3',
            rejectUnauthorized: false, // Allow self-signed certs in dev, but Railway should work with true
            servername: process.env.SMTP_HOST || 'smtppro.zoho.in', // SNI support
            minVersion: 'TLSv1.2', // Enforce minimum TLS version
        },
        // Timeout configuration optimized for Railway deployment
        connectionTimeout: 60000,  // 60s - Railway can be slow to establish connections
        greetingTimeout: 30000,    // 30s - Time to wait for greeting after connection
        socketTimeout: 60000,      // 60s - Time to wait for socket responses
        // Debugging (disable in production if too verbose)
        logger: process.env.NODE_ENV !== 'production',
        debug: process.env.NODE_ENV !== 'production',
        // Connection pooling - keep connections alive
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
    },

    // System Email Addresses
    addresses: {
        support: 'support@edgestone.in', // Main support inbox
        noReply: process.env.MAIL_USER, // Must match authenticated SMTP user for Zoho
    }
};
