const prisma = require('./index');

const NoteModel = {
    // Create new note
    async createNote(data) {
        return prisma.note.create({ data });
    },

    // Find note by ID
    async findNoteById(id) {
        return prisma.note.findUnique({ where: { id } });
    },

    // Find notes for a ticket
    async findNotesByTicketId(ticketId) {
        return prisma.note.findMany({ where: { ticketId } });
    },

    // Update note
    async updateNote(id, updates, tx) {
        const client = tx || prisma;
        return client.note.update({
            where: { id },
            data: updates,
        });
    },

    // Delete note
    async deleteNote(where) {
        return prisma.note.deleteMany({ where });
    }
};

module.exports = NoteModel;
