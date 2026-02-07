const prisma = require('./index');

const SLAModel = {
    // Create new SLA
    async createSLA(data) {
        return prisma.sLA.create({ data });
    },

    // Find SLA by ID
    async findSLAById(id) {
        return prisma.sLA.findUnique({ where: { id } });
    },

    // Find SLA by Circuit ID
    async findSLAByCircuitId(circuitId) {
        return prisma.sLA.findUnique({ where: { circuitId } });
    },

    // Update SLA
    async updateSLA(id, updates, tx) {
        const client = tx || prisma;
        return client.sLA.update({
            where: { id },
            data: updates,
        });
    },

    // Delete SLA
    async deleteSLA(where) {
        return prisma.sLA.deleteMany({ where });
    }
};

module.exports = SLAModel;
