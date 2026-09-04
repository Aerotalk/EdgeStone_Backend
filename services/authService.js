const UserModel = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const login = async (email, password) => {
    logger.info(`🔐 [AUTH] ✨ [LOGIN] 🚀 Initiating deep login sequence for email: 📧 ${email}`);

    let user = await UserModel.findUserByEmail(email);
    let isAgent = false;

    if (!user) {
        // Check if user is an agent
        const agent = await require('../models/agent').findAgentByEmail(email);
        if (agent) {
            user = agent;
            isAgent = true;
            // Use the agent's database role or fallback
            if (!user.role) user.role = agent.role || (agent.isSuperAdmin ? 'Super admin' : 'Support crew');
        } else {
            logger.warn(`⚠️ 🔐 [AUTH] 🛑 [LOGIN] ❌ Login entirely failed: User/Agent totally absent for email: 📧 ${email}`);
            throw new Error('Invalid credentials');
        }
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        logger.warn(`⚠️ 🔐 [AUTH] 🛑 [LOGIN] ❌ Login utterly failed: Incorrect password hash mismatch for user: 📧 ${email}`);
        throw new Error('Invalid credentials');
    }

    logger.info(`🔐 [AUTH] ✅ [LOGIN] 🌟 Spectacular success! Login cleared for user: 📧 ${email} (Resolved Role: 🛡️ ${user.role})`);

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
