const prisma = require('./index');

const CustomerModel = {
    // Create new customer
    async createCustomer(data) {
        return prisma.customer.create({ data });
    },

    // Find customer by ID
    async findCustomerById(id) {
        return prisma.customer.findUnique({ where: { id } });
    },

    // Update customer
    async updateCustomer(id, updates, tx) {
        const client = tx || prisma;
        return client.customer.update({
            where: { id },
            data: updates,
        });
    },

    // Delete customer
    async deleteCustomer(where) {
        return prisma.customer.deleteMany({ where });
    },

    // Find all customers
    async findAllCustomers() {
        return prisma.customer.findMany();
    }
};

module.exports = CustomerModel;
