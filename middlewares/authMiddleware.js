const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            logger.debug('🔑 Verifying JWT token...');

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            let user;

            if (decoded.isAgent) {
                user = await require('../models/agent').findAgentById(decoded.id);
                if (user) {
                    user.role = 'Agent'; // Ensure role is set
                    user.access = { dashboard: true, tickets: true }; // Default access for agents
                }
            } else {
                user = await UserModel.findUserById(decoded.id);
            }

            if (!user) {
                logger.warn(`⚠️ Authorization failed: User/Agent not found for ID ${decoded.id}`);
                res.status(401);
                throw new Error('Not authorized, user not found');
            }

            // Remove passwordHash from user object
            if (user.passwordHash) {
                delete user.passwordHash;
            }

            req.user = user;
            logger.debug(`👤 User authenticated: ${user.email} (${user.role})`);

            next();
        } catch (error) {
            logger.error(`❌ Authorization failed: ${error.message}`);
            res.status(401);
            const message = error.message === 'jwt expired' ? 'Token expired' : 'Not authorized, token failed';
            next(new Error(message));
            // throw new Error(message); // Don't throw here, just call next with error
        }
    }

    if (!token) {
        logger.warn('⚠️ Authorization missing: No token provided');
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
            return next(new Error('Not authorized, user not found'));
        }

        const userRole = req.user.role || 'Agent';
        const isSuperAdmin = req.user.access && req.user.access.superAdmin;

        if (!roles.includes(userRole) && !isSuperAdmin) {
            res.status(403);
            return next(new Error(`User role ${userRole} is not authorized to access this route`));
        }
        next();
    };
};

const requireSuperAdmin = (req, res, next) => {
    if (req.user && req.user.access && req.user.access.superAdmin) {
        next();
    } else {
        res.status(403);
        next(new Error('Not authorized as an admin'));
    }
};

module.exports = {
    protect,
    authorize,
    requireSuperAdmin
};
