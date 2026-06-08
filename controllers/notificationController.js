const notificationService = require('../services/notificationService');

/**
 * Handle SSE Stream Connection
 */
const streamNotifications = (req, res) => {
    notificationService.subscribe(req, res);
};

const getNotifications = async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const notifications = await prisma.notification.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50 // Limit to last 50 for performance
        });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};

const markAsRead = async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const { id } = req.params;
        const notification = await prisma.notification.update({
            where: { id },
            data: { isRead: true }
        });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        await prisma.notification.updateMany({
            where: { isRead: false },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
};

module.exports = {
    streamNotifications,
    getNotifications,
    markAsRead,
    markAllAsRead
};
