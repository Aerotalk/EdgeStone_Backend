const authService = require('../services/authService');
const logger = require('../utils/logger');

const login = async (req, res, next) => {
    try {
        const { email } = req.body;
        logger.debug(`🐞 🔐 [AUTH] 📝 Request received: login for ${email}`);

        const { user, token } = await authService.login(email, req.body.password);

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            access: user.access,
            token
        });
    } catch (error) {
        if (error.message === 'Invalid credentials') {
            logger.warn(`⚠️ 🔐 [AUTH] ⚠️ Login failed: ${error.message}`);
            res.status(401);
        }
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        // Use agentService or User directly.
        // Wait, I need to check what `req.user` looks like. 
        // I'll check authMiddleware and authService.
        res.json(req.user);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    login,
    getMe,
};
