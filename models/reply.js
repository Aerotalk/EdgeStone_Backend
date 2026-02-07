const prisma = require('./index');

const ReplyModel = {
    // Create new reply
    async createReply(data) {
        return prisma.reply.create({ data });
    },

    // Find reply by ID
    async findReplyById(id) {
        return prisma.reply.findUnique({ where: { id } });
    },

    // Find replies for a ticket
    async findRepliesByTicketId(ticketId) {
        return prisma.reply.findMany({ where: { ticketId } });
    },

    // Update reply
    async updateReply(id, updates, tx) {
        const client = tx || prisma;
        return client.reply.update({
            where: { id },
            data: updates,
        });
    },

    // Delete reply
    async deleteReply(where) {
        return prisma.reply.deleteMany({ where });
    }
};

module.exports = ReplyModel;
