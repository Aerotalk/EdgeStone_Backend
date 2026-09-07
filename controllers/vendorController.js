const VendorModel = require('../models/vendor');
const logger = require('../utils/logger');

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Private (Super Admin, Agent)
const getAllVendors = async (req, res, next) => {
    try {
        logger.debug('🐞 🏭 [VENDOR] 📋 Fetching all vendors...');
        const vendors = await VendorModel.findAllVendors();
        logger.info(`🏭 [VENDOR] ✅ Successfully fetched ${vendors.length} vendors`);
        res.status(200).json(vendors);
    } catch (error) {
        logger.error(`🚨 🏭 [VENDOR] ❌ Error fetching vendors: ${error.message}`);
        next(error);
    }
};

// @desc    Get vendor by ID
// @route   GET /api/vendors/:id
// @access  Private (Super Admin, Agent)
const getVendorById = async (req, res, next) => {
    try {
        logger.debug(`🐞 🏭 [VENDOR] 🔍 Fetching vendor with ID: ${req.params.id}`);
        const vendor = await VendorModel.findVendorById(req.params.id);
        if (!vendor) {
            logger.warn(`⚠️ 🏭 [VENDOR] ⚠️ Vendor not found: ${req.params.id}`);
            res.status(404);
            throw new Error('Vendor not found');
        }
        logger.info(`🏭 [VENDOR] ✅ Successfully fetched vendor: ${vendor.name}`);
        res.status(200).json(vendor);
    } catch (error) {
        logger.error(`🚨 🏭 [VENDOR] ❌ Error fetching vendor ${req.params.id}: ${error.message}`);
        next(error);
    }
};

// @desc    Create new vendor
// @route   POST /api/vendors
// @access  Private (Super Admin, Agent)
const createVendor = async (req, res, next) => {
    try {
        const { name, emails, status } = req.body;
        logger.debug(`🐞 🏭 [VENDOR] 📝 Creating new vendor: ${name}`);
        logger.debug(`🐞 🏭 [VENDOR] 📧 Emails: ${emails?.join(', ')}`);

        if (!name || !emails || !Array.isArray(emails) || emails.length === 0) {
            logger.warn('⚠️ 🏭 [VENDOR] ⚠️ Invalid vendor data: Missing name or emails');
            res.status(400);
            throw new Error('Please provide name and at least one email');
        }

        const vendorData = {
            name,
            emails,
            status: status || 'Active',
            createdOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        };

        const vendor = await VendorModel.createVendor(vendorData);
        logger.info(`🏭 [VENDOR] ✅ New vendor created successfully: ${vendor.name} (ID: ${vendor.id})`);
        res.status(201).json(vendor);
    } catch (error) {
        logger.error(`🚨 🏭 [VENDOR] ❌ Error creating vendor: ${error.message}`);
        next(error);
    }
};

// @desc    Update vendor
// @route   PUT /api/vendors/:id
// @access  Private (Super Admin, Agent)
const updateVendor = async (req, res, next) => {
    try {
        const { name, emails, status } = req.body;
        logger.debug(`🐞 🏭 [VENDOR] ✏️ Updating vendor: ${req.params.id}`);

        const vendor = await VendorModel.findVendorById(req.params.id);

        if (!vendor) {
            logger.warn(`⚠️ 🏭 [VENDOR] ⚠️ Vendor not found for update: ${req.params.id}`);
            res.status(404);
            throw new Error('Vendor not found');
        }

        const updates = {};
        if (name) updates.name = name;
        if (emails) updates.emails = emails;
        if (status) updates.status = status;

        logger.debug(`🐞 🏭 [VENDOR] 📝 Update data: ${JSON.stringify(updates)}`);

        const updatedVendor = await VendorModel.updateVendor(req.params.id, updates);
        logger.info(`🏭 [VENDOR] ✅ Vendor updated successfully: ${updatedVendor.name} (ID: ${updatedVendor.id})`);
        res.status(200).json(updatedVendor);
    } catch (error) {
        logger.error(`🚨 🏭 [VENDOR] ❌ Error updating vendor ${req.params.id}: ${error.message}`);
        next(error);
    }
};

// @desc    Delete vendor
// @route   DELETE /api/vendors/:id
// @access  Private (Super Admin, Agent)
const deleteVendor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const prisma = require('../models/index');
        logger.debug(`🐞 🏭 [VENDOR] 🗑️ Deleting vendor: ${id}`);

        const vendor = await VendorModel.findVendorById(id);
        if (!vendor) {
            logger.warn(`⚠️ 🏭 [VENDOR] ⚠️ Vendor not found for deletion: ${id}`);
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }

        // 1. Unlink tickets referencing this vendor
        await prisma.ticket.updateMany({
            where: { vendorId: id },
            data: { vendorId: null }
        });

        // 2. Unlink circuits referencing this vendor
        await prisma.circuit.updateMany({
            where: { vendorId: id },
            data: { vendorId: null }
        });

        // 3. Delete vendorCircuits referencing this vendor
        await prisma.vendorCircuit.deleteMany({
            where: { vendorId: id }
        });

        // 4. Delete vendor SLAs
        const slas = await prisma.sla.findMany({ where: { vendorId: id }, select: { id: true } });
        const slaIds = slas.map(s => s.id);
        if (slaIds.length > 0) {
            await prisma.slaRule.deleteMany({ where: { slaId: { in: slaIds } } });
            await prisma.slaAuditLog.deleteMany({ where: { slaId: { in: slaIds } } });
            await prisma.sla.deleteMany({ where: { id: { in: slaIds } } });
        }

        // 5. Delete the vendor
        await prisma.vendor.delete({ where: { id } });

        logger.info(`🏭 [VENDOR] ✅ Vendor deleted successfully: ${vendor.name} (ID: ${id})`);
        res.status(200).json({ success: true, message: `Vendor ${vendor.name} deleted successfully` });
    } catch (error) {
        logger.error(`🚨 🏭 [VENDOR] ❌ Error deleting vendor ${req.params.id}: ${error.message}`);
        next(error);
    }
};

module.exports = {
    getAllVendors,
    getVendorById,
    createVendor,
    updateVendor,
    deleteVendor
};
