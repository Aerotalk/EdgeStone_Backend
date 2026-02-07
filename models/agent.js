const prisma = require('./index');

const AgentModel = {
    // Create new agent
    async createAgent(data) {
        return prisma.agent.create({ data });
    },

    // Find agent by email
    async findAgentByEmail(email) {
        return prisma.agent.findUnique({ where: { email } });
    },

    // Find agent by ID
    async findAgentById(id) {
        return prisma.agent.findUnique({ where: { id } });
    },

    // Update agent
    async updateAgent(id, updates, tx) {
        const client = tx || prisma;
        return client.agent.update({
            where: { id },
            data: updates,
        });
    },

    // Delete agent
    async deleteAgent(where) {
        return prisma.agent.deleteMany({ where });
    },

    // Find all agents
    async findAllAgents() {
        return prisma.agent.findMany();
    }
};

module.exports = AgentModel;
