const prisma = require('./index');

const WorkNoteModel = {
    // Create new work note
    async createWorkNote(data) {
        return prisma.workNote.create({ data });
    },

    // Find work notes by ticket ID
    async findWorkNotesByTicketId(ticketId) {
        return prisma.workNote.findMany({
            where: { ticketId },
            orderBy: { createdAt: 'asc' },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });
    },

    // Find work note by ID
    async findWorkNoteById(id) {
        return prisma.workNote.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });
    },

    // Update work note
    async updateWorkNote(id, updates) {
        return prisma.workNote.update({
            where: { id },
            data: updates
        });
    },

    // Delete work note
    async deleteWorkNote(id) {
        return prisma.workNote.delete({ where: { id } });
    }
};

module.exports = WorkNoteModel;
