const prisma = require('./index');

const CircuitModel = {
    // Create new circuit
    async createCircuit(data) {
        return prisma.circuit.create({ data });
    },

    // Find circuit by ID
    async findCircuitById(id) {
        return prisma.circuit.findUnique({ where: { id } });
    },

    // Find circuit by Customer Circuit ID
    async findCircuitByCustomerCircuitId(customerCircuitId) {
        return prisma.circuit.findUnique({ where: { customerCircuitId } });
    },

    // Update circuit
    async updateCircuit(id, updates, tx) {
        const client = tx || prisma;
        return client.circuit.update({
            where: { id },
            data: updates,
        });
    },

    // Delete circuit
    async deleteCircuit(where) {
        return prisma.circuit.deleteMany({ where });
    },

    // Find all circuits
    async findAllCircuits() {
        return prisma.circuit.findMany();
    }
};

module.exports = CircuitModel;
