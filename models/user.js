const prisma = require('./index');

const UserModel = {
    // Create new user
    async createUser(data) {
        return prisma.user.create({ data });
    },

    // Find user by email
    async findUserByEmail(email) {
        return prisma.user.findUnique({ where: { email } });
    },

    // Find user by ID
    async findUserById(id) {
        return prisma.user.findUnique({ where: { id } });
    },

    // Update user (transactional support)
    async updateUser(id, updates, tx) {
        const client = tx || prisma;
        return client.user.update({
            where: { id },
            data: updates,
        });
    },

    // Delete user
    async deleteUser(where) {
        return prisma.user.deleteMany({ where });
    },

    // Find all users
    async findAllUsers() {
        return prisma.user.findMany();
    }
};

module.exports = UserModel;
