const ClientModel = require('../models/client');
const logger = require('../utils/logger');

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private (Super Admin, Agent)
const getAllClients = async (req, res, next) => {
    try {
        logger.debug('📋 Fetching all clients...');
        const clients = await ClientModel.findAllClients();
        logger.info(`✅ Successfully fetched ${clients.length} clients`);
        res.status(200).json(clients);
    } catch (error) {
        logger.error(`❌ Error fetching clients: ${error.message}`);
        next(error);
    }
};

// @desc    Get client by ID
// @route   GET /api/clients/:id
// @access  Private (Super Admin, Agent)
const getClientById = async (req, res, next) => {
    try {
        logger.debug(`🔍 Fetching client with ID: ${req.params.id}`);
        const client = await ClientModel.findClientById(req.params.id);
        if (!client) {
            logger.warn(`⚠️ Client not found: ${req.params.id}`);
            res.status(404);
            throw new Error('Client not found');
        }
        logger.info(`✅ Successfully fetched client: ${client.name}`);
        res.status(200).json(client);
    } catch (error) {
        logger.error(`❌ Error fetching client ${req.params.id}: ${error.message}`);
        next(error);
    }
};

// @desc    Create new client
// @route   POST /api/clients
// @access  Private (Super Admin, Agent)
const createClient = async (req, res, next) => {
    try {
        const { name, emails, status } = req.body;
        logger.debug(`📝 Creating new client: ${name}`);
        logger.debug(`📧 Emails: ${emails?.join(', ')}`);

        if (!name || !emails || !Array.isArray(emails) || emails.length === 0) {
            logger.warn('⚠️ Invalid client data: Missing name or emails');
            res.status(400);
            throw new Error('Please provide name and at least one email');
        }

        const clientData = {
            name,
            emails,
            status: status || 'Active',
            createdOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        };

        const client = await ClientModel.createClient(clientData);
        logger.info(`✅ New client created successfully: ${client.name} (ID: ${client.id})`);
        res.status(201).json(client);
    } catch (error) {
        logger.error(`❌ Error creating client: ${error.message}`);
        next(error);
    }
};

// @desc    Update client
// @route   PUT /api/clients/:id
// @access  Private (Super Admin, Agent)
const updateClient = async (req, res, next) => {
    try {
        const { name, emails, status } = req.body;
        logger.debug(`✏️ Updating client: ${req.params.id}`);

        const client = await ClientModel.findClientById(req.params.id);

        if (!client) {
            logger.warn(`⚠️ Client not found for update: ${req.params.id}`);
            res.status(404);
            throw new Error('Client not found');
        }

        const updates = {};
        if (name) updates.name = name;
        if (emails) updates.emails = emails;
        if (status) updates.status = status;

        logger.debug(`📝 Update data: ${JSON.stringify(updates)}`);

        const updatedClient = await ClientModel.updateClient(req.params.id, updates);
        logger.info(`✅ Client updated successfully: ${updatedClient.name} (ID: ${updatedClient.id})`);
        res.status(200).json(updatedClient);
    } catch (error) {
        logger.error(`❌ Error updating client ${req.params.id}: ${error.message}`);
        next(error);
    }
};

module.exports = {
    getAllClients,
    getClientById,
    createClient,
    updateClient
};
