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
        if (!messageId || typeof messageId !== 'string') return null;
        const clean = messageId.trim();
        const bare = clean.replace(/^<|>$/g, '').trim();
        const bracketed = `<${bare}>`;
        const idsToMatch = Array.from(new Set([clean, bare, bracketed])).filter(Boolean);

        return prisma.ticket.findFirst({
            where: { messageId: { in: idsToMatch } },
            include: { client: true, vendor: true }
        });
    },

    // Find a reply by its outgoing Message-ID to match client thread replies
    async findReplyByMessageId(messageId) {
        if (!messageId || typeof messageId !== 'string') return null;
        const clean = messageId.trim();
        const bare = clean.replace(/^<|>$/g, '').trim();
        const bracketed = `<${bare}>`;
        const idsToMatch = Array.from(new Set([clean, bare, bracketed])).filter(Boolean);

        return prisma.reply.findFirst({
            where: { messageId: { in: idsToMatch } },
            include: {
                ticket: {
                    include: { client: true, vendor: true }
                }
            }
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
