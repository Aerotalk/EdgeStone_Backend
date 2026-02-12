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

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info(`🚀 Server running on port ${PORT}`);

        // Start IMAP Listener for incoming emails
        const emailService = require('./services/emailService');
        // emailService.startImapListener needs to be logged inside the service, but we can log initialization here
        logger.info('📧 Initializing IMAP Listener...');
        emailService.startImapListener();
    });
}

module.exports = app;
