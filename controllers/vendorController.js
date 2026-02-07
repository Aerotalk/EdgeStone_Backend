const VendorModel = require('../models/vendor');
const logger = require('../utils/logger');

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Private (Super Admin, Agent)
const getAllVendors = async (req, res, next) => {
    try {
        logger.debug('📋 Fetching all vendors...');
        const vendors = await VendorModel.findAllVendors();
        logger.info(`✅ Successfully fetched ${vendors.length} vendors`);
        res.status(200).json(vendors);
    } catch (error) {
        logger.error(`❌ Error fetching vendors: ${error.message}`);
        next(error);
    }
};

// @desc    Get vendor by ID
// @route   GET /api/vendors/:id
// @access  Private (Super Admin, Agent)
const getVendorById = async (req, res, next) => {
    try {
        logger.debug(`🔍 Fetching vendor with ID: ${req.params.id}`);
        const vendor = await VendorModel.findVendorById(req.params.id);
        if (!vendor) {
            logger.warn(`⚠️ Vendor not found: ${req.params.id}`);
            res.status(404);
            throw new Error('Vendor not found');
        }
        logger.info(`✅ Successfully fetched vendor: ${vendor.name}`);
        res.status(200).json(vendor);
    } catch (error) {
        logger.error(`❌ Error fetching vendor ${req.params.id}: ${error.message}`);
        next(error);
    }
};

// @desc    Create new vendor
// @route   POST /api/vendors
// @access  Private (Super Admin, Agent)
const createVendor = async (req, res, next) => {
    try {
        const { name, emails, status } = req.body;
        logger.debug(`📝 Creating new vendor: ${name}`);
        logger.debug(`📧 Emails: ${emails?.join(', ')}`);

        if (!name || !emails || !Array.isArray(emails) || emails.length === 0) {
            logger.warn('⚠️ Invalid vendor data: Missing name or emails');
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
        logger.info(`✅ New vendor created successfully: ${vendor.name} (ID: ${vendor.id})`);
        res.status(201).json(vendor);
    } catch (error) {
        logger.error(`❌ Error creating vendor: ${error.message}`);
        next(error);
    }
};

// @desc    Update vendor
// @route   PUT /api/vendors/:id
// @access  Private (Super Admin, Agent)
const updateVendor = async (req, res, next) => {
    try {
        const { name, emails, status } = req.body;
        logger.debug(`✏️ Updating vendor: ${req.params.id}`);

        const vendor = await VendorModel.findVendorById(req.params.id);

        if (!vendor) {
            logger.warn(`⚠️ Vendor not found for update: ${req.params.id}`);
            res.status(404);
            throw new Error('Vendor not found');
        }

        const updates = {};
        if (name) updates.name = name;
        if (emails) updates.emails = emails;
        if (status) updates.status = status;

        logger.debug(`📝 Update data: ${JSON.stringify(updates)}`);

        const updatedVendor = await VendorModel.updateVendor(req.params.id, updates);
        logger.info(`✅ Vendor updated successfully: ${updatedVendor.name} (ID: ${updatedVendor.id})`);
        res.status(200).json(updatedVendor);
    } catch (error) {
        logger.error(`❌ Error updating vendor ${req.params.id}: ${error.message}`);
        next(error);
    }
};

module.exports = {
    getAllVendors,
    getVendorById,
    createVendor,
    updateVendor
};
