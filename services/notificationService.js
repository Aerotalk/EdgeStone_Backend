const logger = require('../utils/logger');

let clients = [];

/**
 * Handle new SSE client connection
 */
const subscribe = (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection success message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Keery Notifications Connected' })}\n\n`);

    // Add client to list
    clients.push(res);
    logger.info(`🔔 [NOTIFICATIONS] New client connected. Total clients: ${clients.length}`);

    // Remove client on connection close
    req.on('close', () => {
        clients = clients.filter(client => client !== res);
        logger.info(`🔔 [NOTIFICATIONS] Client disconnected. Total clients: ${clients.length}`);
    });
};

/**
 * Send notification to all connected clients
 * @param {Object} data 
 */
const sendNotification = async (data) => {
    logger.info(`🔔 [NOTIFICATIONS] Sending event: ${data.type}`);
    
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        
        // Save to DB
        const savedNotif = await prisma.notification.create({
            data: {
                title: data.type === 'new_ticket' ? 'New Ticket' : 'Ticket Update',
                message: data.message || '',
                type: data.type || 'info',
                ticketId: data.ticketId || null
            }
        });
        
        // Attach ID so frontend can mark read
        data.id = savedNotif.id;
        
    } catch (err) {
        logger.error(`🚨 [NOTIFICATIONS] Failed to save to DB: ${err.message}`);
    }

    clients.forEach(client => {
        try {
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
            logger.error(`🚨 [NOTIFICATIONS] Error sending to client: ${error.message}`);
        }
    });
};

module.exports = {
    subscribe,
    sendNotification
};
