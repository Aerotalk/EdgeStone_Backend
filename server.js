const express = require('express');
console.log("\n\n!!! 🚀 SERVER.JS STARTING - VERSION CHECK 1 - IF YOU SEE THIS, IT IS THE RIGHT CODE 🚀 !!!\n\n");
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

dotenv.config();


const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic CORS Configuration
const allowedOrigins = [
    'http://localhost:5173', // Local Vite Frontend
    'http://localhost:5000', // Local Backend (for self-calls if applicable)
    'https://edgestonefrontend.vercel.app', // Production Vercel Frontend
    'https://edgestonefrontend-b4zz7k8lh-aerotalks-projects.vercel.app', // Vercel Preview/Production URL
];

// Add production frontend URL if available
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            // For development ease, maybe log the blocked origin?
            // console.log('Blocked Origin:', origin);
            // For now, in dev we might want to be permissive, but explicit for prod.
            // If deployed on Vercel, the origin will be the Vercel URL.

            // If we want to allow Vercel preview deployments (e.g., *.vercel.app), we need regex
            // But strictly following the plan:
            return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
        }
        return callback(null, true);
    },
    credentials: true // If we need cookies/sessions cross-origin
}));
app.use(helmet());
// Stream morgan logs to winston
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Routes (Placeholders)
// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'EdgeStone Ticket System API is running',
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.use('/api/auth', require('./routes/authRoutes'));
logger.debug('🔐 Auth routes registered');

app.use('/api/tickets', require('./routes/ticketRoutes'));
logger.debug('🎫 Ticket routes registered');

app.use('/api/email', require('./routes/emailRoutes'));
logger.debug('📧 Email routes registered');

app.use('/api/agents', require('./routes/agentRoutes'));
logger.debug('👥 Agent routes registered');

// app.use('/api/admin', require('./routes/adminRoutes'));

app.use('/api/clients', require('./routes/clientRoutes'));
logger.debug('🏢 Client routes registered');

app.use('/api/vendors', require('./routes/vendorRoutes'));
logger.debug('🏭 Vendor routes registered');

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// ... (previous code)

logger.info('⏳ Attempting to start server...');

// Force start if PORT is defined, or if main module
// debugging: log the condition
logger.info(`🔍 require.main === module: ${require.main === module}`);

if (require.main === module || process.env.NODE_ENV === 'production') {
    try {
        const server = app.listen(PORT, () => {
            logger.info(`🚀 Server running on port ${PORT}`);

            // Start IMAP Listener for incoming emails
            try {
                const emailService = require('./services/emailService');
                logger.info('📧 Initializing IMAP Listener...');
                emailService.startImapListener();
            } catch (err) {
                logger.error('❌ Failed to start IMAP listener:', err);
            }
        });

        server.on('error', (err) => {
            logger.error('❌ Server failed to start:', err);
            process.exit(1);
        });
    } catch (err) {
        logger.error('❌ Synchronous error during app.listen:', err);
        process.exit(1);
    }
} else {
    logger.warn('⚠️ Server not started: require.main !== module');
}

module.exports = app;

// Add global error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    // logger may not be available if it failed to initialize
    try { logger.error('❌ Uncaught Exception:', err); } catch (e) { }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    try { logger.error('❌ Unhandled Rejection:', reason); } catch (e) { }
    // process.exit(1);
});
