const prisma = require('./index');

const ClientModel = {
    // Create new client
    async createClient(data) {
        return prisma.client.create({ data });
    },

    // Find client by ID
    async findClientById(id) {
        return prisma.client.findUnique({ where: { id } });
    },

    // Update client
    async updateClient(id, updates, tx) {
        const client = tx || prisma;
        return client.client.update({
            where: { id },
            data: updates,
        });
    },

    // Delete client
    async deleteClient(where) {
        return prisma.client.deleteMany({ where });
    },

    // Find all clients
    async findAllClients() {
        return prisma.client.findMany();
    }
};

module.exports = ClientModel;
