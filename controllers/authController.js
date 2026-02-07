const authService = require('../services/authService');
const logger = require('../utils/logger');

const login = async (req, res, next) => {
    try {
        const { email } = req.body;
        logger.debug(`📝 Request received: login for ${email}`);

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
            logger.warn(`⚠️ Login failed: ${error.message}`);
            res.status(401);
        }
        next(error);
    }
};

module.exports = {
    login,
};
