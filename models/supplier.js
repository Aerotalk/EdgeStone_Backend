const prisma = require('./index');

const SupplierModel = {
    // Create new supplier
    async createSupplier(data) {
        return prisma.supplier.create({ data });
    },

    // Find supplier by ID
    async findSupplierById(id) {
        return prisma.supplier.findUnique({ where: { id } });
    },

    // Update supplier
    async updateSupplier(id, updates, tx) {
        const client = tx || prisma;
        return client.supplier.update({
            where: { id },
            data: updates,
        });
    },

    // Delete supplier
    async deleteSupplier(where) {
        return prisma.supplier.deleteMany({ where });
    },

    // Find all suppliers
    async findAllSuppliers() {
        return prisma.supplier.findMany();
    }
};

module.exports = SupplierModel;
