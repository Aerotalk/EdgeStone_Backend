const agentService = require('../services/agentService');
const logger = require('../utils/logger');

const createAgent = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: Create Agent');
        const agent = await agentService.createAgent(req.body);
        res.status(201).json(agent);
    } catch (error) {
        if (error.message === 'Agent already exists') {
            res.status(409);
        }
        next(error);
    }
};

const getAgents = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: Get All Agents');
        const agents = await agentService.getAgents(req.query);
        res.json(agents);
    } catch (error) {
        next(error);
    }
};

const getAgentById = async (req, res, next) => {
    try {
        const { id } = req.params;
        logger.debug(`📝 Request received: Get Agent by ID ${id}`);
        const agent = await agentService.getAgentById(id);
        res.json(agent);
    } catch (error) {
        if (error.message === 'Agent not found') {
            res.status(404);
        }
        next(error);
    }
};

const updateAgent = async (req, res, next) => {
    try {
        const { id } = req.params;
        logger.debug(`📝 Request received: Update Agent ${id}`);
        const agent = await agentService.updateAgent(id, req.body);
        res.json(agent);
    } catch (error) {
        if (error.message === 'Agent not found') {
            res.status(404);
        }
        next(error);
    }
};

module.exports = {
    createAgent,
    getAgents,
    getAgentById,
    updateAgent
};
