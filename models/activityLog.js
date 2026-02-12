const prisma = require('./index');

const ActivityLogModel = {
    // Create new activity log
    async createActivityLog(data) {
        return prisma.activityLog.create({ data });
    },

    // Find activity logs by ticket ID
    async findActivityLogsByTicketId(ticketId) {
        return prisma.activityLog.findMany({
            where: { ticketId },
            orderBy: { createdAt: 'desc' }
        });
    },

    // Find all activity logs with optional filters
    async findAllActivityLogs(args = {}) {
        return prisma.activityLog.findMany(args);
    },

    // Find activity log by ID
    async findActivityLogById(id) {
        return prisma.activityLog.findUnique({ where: { id } });
    }
};

module.exports = ActivityLogModel;
