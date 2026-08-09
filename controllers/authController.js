const authService = require('../services/authService');
const logger = require('../utils/logger');

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        await authService.forgotPassword(email);
        res.json({ success: true, message: 'If an account exists with this email, a password reset link has been sent.' });
    } catch (error) {
        logger.error(`[AUTH] forgotPassword error: ${error.message}`);
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and newPassword are required' });
        }
        await authService.resetPassword(token, newPassword);
        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) {
        logger.error(`[AUTH] resetPassword error: ${error.message}`);
        if (error.message === 'Invalid or expired token' || error.message === 'Token has expired') {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
};

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
            profilePicture: user.profilePicture,
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

const updateProfilePicture = async (req, res, next) => {
    try {
        const { profilePicture } = req.body;
        const userId = req.user.id;
        
        logger.debug(`🐞 👤 [AUTH] 📝 Request received: Update profile picture for ${userId}`);

        if (!profilePicture) {
            return res.status(400).json({ error: 'profilePicture is required' });
        }

        const prisma = require('../models/index');
        
        let updatedUser;
        try {
            const agent = await prisma.agent.findUnique({ where: { id: userId } });
            if (agent) {
                updatedUser = await prisma.agent.update({
                    where: { id: userId },
                    data: { profilePicture }
                });
            } else {
                updatedUser = await prisma.user.update({
                    where: { id: userId },
                    data: { profilePicture }
                });
            }
        } catch (dbError) {
            logger.error(`❌ [AUTH] Database error updating profile picture: ${dbError.message}`);
            return res.status(500).json({ error: 'Failed to update profile picture in database' });
        }

        res.json({
            success: true,
            message: 'Profile picture updated successfully',
            profilePicture: updatedUser.profilePicture
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    login,
    getMe,
    updateProfilePicture,
    forgotPassword,
    resetPassword
};
