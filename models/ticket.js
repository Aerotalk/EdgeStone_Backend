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
    }
};

module.exports = TicketModel;
