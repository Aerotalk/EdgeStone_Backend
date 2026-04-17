const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            logger.debug('🛡️ [MIDDLEWARE] 🔑 Verifying incoming JWT Bearer token...');

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            let user;

            if (decoded.isAgent) {
                user = await require('../models/agent').findAgentById(decoded.id);
                if (user) {
                    // Use database role
                    user.role = user.role || (user.isSuperAdmin ? 'Super admin' : 'Support crew');
                    user.access = { dashboard: true, tickets: true }; // Default access for agents
                }
            } else {
                user = await UserModel.findUserById(decoded.id);
            }

            if (!user) {
                logger.warn(`🚫 [MIDDLEWARE] ⚠️ Authorization completely failed: User/Agent strictly not found for ID ${decoded.id}`);
                res.status(401);
                throw new Error('Not authorized, user not found');
            }

            // Remove passwordHash from user object
            if (user.passwordHash) {
                delete user.passwordHash;
            }

            req.user = user;
            logger.info(`✅ [MIDDLEWARE] 👤 User seamlessly authenticated & cleared identity barriers! Email: ${user.email} (Assigned Role: 🛡️ ${user.role})`);

            next();
        } catch (error) {
            logger.error(`❌ [MIDDLEWARE] 💥 JWT Authorization deeply failed or corrupted: ${error.message}`);
            res.status(401);
            const message = error.message === 'jwt expired' ? 'Token expired' : 'Not authorized, token failed';
            next(new Error(message));
            // throw new Error(message); // Don't throw here, just call next with error
        }
    }

    if (!token) {
        logger.warn('🚩 [MIDDLEWARE] ⚠️ Authorization strictly blocked: No Auth token provided in headers!');
        res.status(401);
        // next(new Error('Not authorized, no token'));
        throw new Error('Not authorized, no token');
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        // Check if user role is included in allowed roles
        // Also allow if user is superAdmin (access.superAdmin = true)
        if (!req.user) {
            logger.error('🚫 [AUTHORIZE] ⚠️ Critical block: Not authorized, user payload totally absent!');
            return next(new Error('Not authorized, user not found'));
        }

        const userRole = req.user.role || 'Support crew';
        const isSuperAdmin = (req.user.access && req.user.access.superAdmin) || (req.user.role === 'Super admin') || req.user.isSuperAdmin;

        if (!roles.includes(userRole) && !isSuperAdmin) {
            logger.debug(`🛑 [AUTHORIZE] ⛔ User Role 👤 [${userRole}] forcefully blocked! Missing required roles: 📜 [${roles.join(', ')}]`);
            res.status(403);
            return next(new Error(`User role ${userRole} is severely restricted and not authorized to access this route`));
        }

        logger.debug(`✅ [AUTHORIZE] 🎉 User Role 👤 [${userRole}] successfully granted route access pathway!`);
        next();
    };
};

const requireSuperAdmin = (req, res, next) => {
    const isSuperAdmin = (req.user && req.user.access && req.user.access.superAdmin) || (req.user && req.user.role === 'Super admin') || (req.user && req.user.isSuperAdmin);
    if (isSuperAdmin) {
        logger.info('👑 [SUPER ADMIN GUARD] ✅ Supreme Admin successfully verified and passed through heavily guarded gateway!');
        next();
    } else {
        logger.warn('🛑 [SUPER ADMIN GUARD] ⛔ Standard user denied access. Super Admin explicit requirements heavily enforced!');
        res.status(403);
        next(new Error('Not authorized as an admin'));
    }
};

module.exports = {
    protect,
    authorize,
    requireSuperAdmin
};
