const prisma = require('./index');

const SLARecordModel = {
    // Create new SLA record
    async createSLARecord(data) {
        return prisma.sLARecord.create({ data });
    },

    // Find SLA record by ID
    async findSLARecordById(id) {
        return prisma.sLARecord.findUnique({ where: { id } });
    },

    // Find SLA record by Ticket ID
    async findSLARecordByTicketId(ticketId) {
        return prisma.sLARecord.findUnique({ where: { ticketId } });
    },

    // Update SLA record
    async updateSLARecord(id, updates, tx) {
        const client = tx || prisma;
        return client.sLARecord.update({
            where: { id },
            data: updates,
        });
    },

    // Delete SLA record
    async deleteSLARecord(where) {
        return prisma.sLARecord.deleteMany({ where });
    }
};

module.exports = SLARecordModel;
