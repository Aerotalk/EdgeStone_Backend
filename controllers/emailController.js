const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const handleWebhook = async (req, res, next) => {
    try {
        logger.debug('📝 Webhook received');
        // Handle Zepto/Zoho webhooks if applicable
        res.json({ received: true });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    handleWebhook,
};
