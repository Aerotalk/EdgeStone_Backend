const prisma = require('./index');

const TicketModel = {
    // Create new ticket
    async createTicket(data) {
        return prisma.ticket.create({ data });
    },

    // Find ticket by ID (UUID)
    async findTicketById(id) {
        return prisma.ticket.findUnique({ where: { id } });
    },

    // Find ticket by Ticket ID (e.g. #1234)
    async findTicketByTicketId(ticketId) {
        return prisma.ticket.findUnique({ where: { ticketId } });
    },

    // Update ticket
    async updateTicket(id, updates, tx) {
        const client = tx || prisma;
        return client.ticket.update({
            where: { id },
            data: updates,
        });
    },

    // Delete ticket
    async deleteTicket(where) {
        return prisma.ticket.deleteMany({ where });
    },

    // Find all tickets
    async findAllTickets(args = {}) {
        return prisma.ticket.findMany(args);
    },

    // Add reply to ticket
    async addReply(ticketId, replyData) {
        return prisma.reply.create({
            data: {
                ...replyData,
                ticketId
            }
        });
    },

    // Find ticket by original email Message-ID (for client reply threading)
    async findTicketByMessageId(messageId) {
        if (!messageId) return null;
        return prisma.ticket.findFirst({ where: { messageId } });
    },

    // Find a reply by its outgoing Message-ID to match client thread replies
    async findReplyByMessageId(messageId) {
        if (!messageId) return null;
        return prisma.reply.findFirst({
            where: { messageId },
            include: { ticket: true }
        });
    },

    // Update a reply (used to save the generated messageId after sending)
    async updateReply(id, updates) {
        return prisma.reply.update({
            where: { id },
            data: updates
        });
    }
};

module.exports = TicketModel;
