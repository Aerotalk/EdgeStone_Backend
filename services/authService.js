const UserModel = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const login = async (email, password) => {
    logger.debug(`🔐 Attempting login for email: ${email}`);

    let user = await UserModel.findUserByEmail(email);
    let isAgent = false;

    if (!user) {
        // Check if user is an agent
        const agent = await require('../models/agent').findAgentByEmail(email);
        if (agent) {
            user = agent;
            isAgent = true;
            // Ensure agent has a role property for token consistency
            if (!user.role) user.role = 'Agent';
        } else {
            logger.warn(`🛑 Login failed: User/Agent not found for email: ${email}`);
            throw new Error('Invalid credentials');
        }
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        logger.warn(`🛑 Login failed: Invalid password for user: ${email}`);
        throw new Error('Invalid credentials');
    }

    logger.info(`✅ Login successful for user: ${email} (${user.role})`);

    const token = jwt.sign(
        { id: user.id, role: user.role, isAgent },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return { user, token };
};

module.exports = {
    login,
};
