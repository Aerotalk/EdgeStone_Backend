const AgentModel = require('../models/agent');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const createAgent = async (data) => {
    const { name, email, password, status, emails, isSuperAdmin, role } = data;

    logger.debug(`🐞 🕵️ [AGENT] 🛠️ Creating new agent: ${name} (${email})`);

    // Check if agent exists
    const existingAgent = await AgentModel.findAgentByEmail(email);

    if (existingAgent) {
        logger.warn(`⚠️ 🕵️ [AGENT] ⚠️ Agent creation failed: Agent already exists with email ${email}`);
        throw new Error('Agent already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create Agent
    // Format createdOn as "DD MMM YYYY"
    const date = new Date();
    const createdOn = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const agent = await AgentModel.createAgent({
        name,
        email,
        passwordHash,
        status: status || 'Active',
        emails: emails && emails.length > 0 ? emails : [email], // Use provided emails or default to primary email
        isSuperAdmin: isSuperAdmin || false,
        role: role || (isSuperAdmin ? 'Super admin' : 'Support crew'),
        createdOn
    });

    logger.info(`🕵️ [AGENT] ✅ Agent created successfully: ${agent.name} (${agent.id})`);

    return agent;
};

const getAgents = async (query) => {
    logger.debug('🐞 🕵️ [AGENT] 📋 Fetching all agents...');
    const agents = await AgentModel.findAllAgents();
    logger.debug(`🐞 🕵️ [AGENT] 🔢 Retrieved ${agents.length} agents.`);
    return agents;
};

const updateAgent = async (id, data) => {
    const { name, email, status, emails, isSuperAdmin, role } = data;

    logger.debug(`🐞 🕵️ [AGENT] 🛠️ Updating agent ${id}...`);

    const agent = await AgentModel.findAgentById(id);
    if (!agent) {
        logger.warn(`⚠️ 🕵️ [AGENT] ⚠️ Update failed: Agent not found for ID ${id}`);
        throw new Error('Agent not found');
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email; // Might need unique check if changing email
    if (status) updateData.status = status;
    if (emails) updateData.emails = emails; // expect Array
    if (typeof isSuperAdmin !== 'undefined') updateData.isSuperAdmin = isSuperAdmin;
    if (role) updateData.role = role;

    // Handle password update if provided (non-empty string)
    if (data.password && data.password.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        updateData.passwordHash = await bcrypt.hash(data.password, salt);
    }

    const updatedAgent = await AgentModel.updateAgent(id, updateData);

    logger.info(`🕵️ [AGENT] ✅ Agent updated successfully: ${updatedAgent.name} (${updatedAgent.id})`);

    return updatedAgent;
};

const getAgentById = async (id) => {
    logger.debug(`🐞 🕵️ [AGENT] Fetching agent by ID: ${id}`);
    const agent = await AgentModel.findAgentById(id);
    if (!agent) {
        throw new Error('Agent not found');
    }
    return agent;
};

module.exports = {
    createAgent,
    getAgents,
    updateAgent,
    getAgentById
};
