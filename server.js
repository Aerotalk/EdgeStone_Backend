const express = require('express');
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
app.use(cors());
app.use(helmet());
// Stream morgan logs to winston
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Routes (Placeholders)
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
