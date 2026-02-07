const prisma = require('./index');

const VendorModel = {
    // Create new vendor
    async createVendor(data) {
        return prisma.vendor.create({ data });
    },

    // Find vendor by ID
    async findVendorById(id) {
        return prisma.vendor.findUnique({ where: { id } });
    },

    // Update vendor
    async updateVendor(id, updates, tx) {
        const client = tx || prisma;
        return client.vendor.update({
            where: { id },
            data: updates,
        });
    },

    // Delete vendor
    async deleteVendor(where) {
        return prisma.vendor.deleteMany({ where });
    },

    // Find all vendors
    async findAllVendors() {
        return prisma.vendor.findMany();
    }
};

module.exports = VendorModel;
