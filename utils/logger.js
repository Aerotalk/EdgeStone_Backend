const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const { getISTString } = require('./timeUtils');

// Custom format with emojis
const emojiFormat = winston.format.printf(({ level, message, timestamp, stack }) => {
    let emoji = '';
    switch (level) {
        case 'info':
            emoji = 'ℹ️';
            break;
        case 'error':
            emoji = '❌';
            break;
        case 'warn':
            emoji = '⚠️';
            break;
        case 'debug':
            emoji = '🐛';
            break;
        default:
            emoji = '📝';
    }

    // For errors, include stack trace if available
    const logMessage = stack || message;

    // Use IST timestamp
    const istTime = getISTString();

    return `${istTime} [${level.toUpperCase()}] ${emoji} : ${logMessage}`;
});

const logger = winston.createLogger({
    level: 'debug', // Log everything from debug and above
    format: winston.format.combine(
        // winston.format.timestamp(), // We are providing our own timestamp in the print function
        emojiFormat
    ),
    transports: [
        // Error logs
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Info logs (combined)
        new winston.transports.File({
            filename: path.join(logDir, 'info.log'),
            level: 'info',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Debug logs
        new winston.transports.File({
            filename: path.join(logDir, 'debug.log'),
            level: 'debug',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});

// If we're not in production, log to console as well
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            // winston.format.timestamp(), // Custom timestamp in printf
            winston.format.printf(({ level, message, timestamp, stack }) => {
                let emoji = '';
                // Simple colorized output doesn't need emoji logic again if we use custom print, 
                // but let's stick to consistent emoji
                if (level.includes('info')) emoji = 'ℹ️';
                if (level.includes('error')) emoji = '❌';
                if (level.includes('warn')) emoji = '⚠️';
                if (level.includes('debug')) emoji = '🐛';

                const istTime = getISTString();
                return `${istTime} [${level}] ${emoji} : ${stack || message}`;
            })
        ),
    }));
}

module.exports = logger;
