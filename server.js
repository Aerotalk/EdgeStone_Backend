const express = require('express');
console.log("\n\n!!! 🚀 SERVER.JS STARTING - VERSION CHECK 2 - HANDLERS AT TOP 🚀 !!!\n\n");

// 1. REGISTER GLOBAL ERROR HANDLERS FIRST
process.on('uncaughtException', (err) => {
    console.error('❌ CRITICAL: Uncaught Exception:', err);
    // Try to log to file if logger is available, but console.error is safest for immediate stderr capture
    try {
        if (global.logger) global.logger.error('❌ CRITICAL: Uncaught Exception:', err);
    } catch (e) { }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
    try {
        if (global.logger) global.logger.error('❌ CRITICAL: Unhandled Rejection:', reason);
    } catch (e) { }
});

const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { errorHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

// Make logger globally available for the exception handlers
global.logger = logger;

dotenv.config();


const app = express();

// Middleware
// Limit raised to 10MB to support signatures with embedded base64 images
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

        // Check against allowed origins list
        const isAllowed = allowedOrigins.includes(origin);

        // Check if it's a Vercel deployment (allow all *.vercel.app)
        const isVercel = origin.includes('.vercel.app');

        if (isAllowed || isVercel) {
            return callback(null, true);
        } else {
            // Log the blocked origin for debugging
            if (global.logger) global.logger.warn(`⚠️ CORS Blocked Origin: ${origin}`);
            return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
        }
    },
    credentials: true // If we need cookies/sessions cross-origin
}));
app.use(helmet({
    crossOriginResourcePolicy: false,
}));
// Stream morgan logs to winston
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Wrap Route Includes in Try-Catch to debug startup crashes
try {
    app.use('/api/auth', require('./routes/authRoutes'));
    logger.debug('🔐 Auth routes registered');
} catch (error) {
    logger.error('❌ Failed to load Auth Routes:', error);
}

try {
    app.use('/api/tickets', require('./routes/ticketRoutes'));
    logger.debug('🎫 Ticket routes registered');
} catch (error) {
    logger.error('❌ Failed to load Ticket Routes:', error);
}

try {
    app.use('/api/email', require('./routes/emailRoutes'));
    logger.debug('📧 Email routes registered');
} catch (error) {
    logger.error('❌ Failed to load Email Routes:', error);
}

try {
    app.use('/api/agents', require('./routes/agentRoutes'));
    logger.debug('👥 Agent routes registered');
} catch (error) {
    logger.error('❌ Failed to load Agent Routes:', error);
}

try {
    app.use('/api/circuits', require('./routes/circuitRoutes'));
    logger.debug('🔌 Circuit routes registered');
} catch (error) {
    logger.error('❌ Failed to load Circuit Routes:', error);
}

// app.use('/api/admin', require('./routes/adminRoutes'));

try {
    app.use('/api/clients', require('./routes/clientRoutes'));
    logger.debug('🏢 Client routes registered');
} catch (error) {
    logger.error('❌ Failed to load Client Routes:', error);
}

try {
    app.use('/api/vendors', require('./routes/vendorRoutes'));
    logger.debug('🏭 Vendor routes registered');
} catch (error) {
    logger.error('❌ Failed to load Vendor Routes:', error);
}

try {
    app.use('/api/sla-records', require('./routes/slaRecordRoutes'));
    logger.debug('📈 SLA Record routes registered');
} catch (error) {
    logger.error('❌ Failed to load SLA Record Routes:', error);
}

try {
    app.use('/api/sla', require('./routes/slaRoutes'));
    logger.debug('🛡️  SLA Management routes registered');
} catch (error) {
    logger.error('❌ Failed to load SLA Management Routes:', error);
}

try {
    app.use('/api/signatures', require('./routes/signatureRoutes'));
    logger.debug('✍️  Signature routes registered');
} catch (error) {
    logger.error('❌ Failed to load Signature Routes:', error);
}

try {
    app.use('/api/ai', require('./routes/aiRoutes'));
    logger.debug('🤖 AI Support routes registered');
} catch (error) {
    logger.error('❌ Failed to load AI Routes:', error);
}

try {
    app.use('/api/upload', require('./routes/uploadRoutes'));
    logger.debug('📁 Upload routes registered');
} catch (error) {
    logger.error('❌ Failed to load Upload Routes:', error);
}

try {
    app.use('/api/global-note', require('./routes/globalNoteRoutes'));
    logger.debug('📝 Global Note routes registered');
} catch (error) {
    logger.error('❌ Failed to load Global Note Routes:', error);
}

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

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
