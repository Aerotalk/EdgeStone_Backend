const emailService = require('../services/emailService');
const emailSuggestionService = require('../services/emailSuggestionService');
const logger = require('../utils/logger');

const handleWebhook = async (req, res, next) => {
    try {
        logger.debug('🐞 📧 [EMAIL] 📝 Webhook received');
        // Handle Zepto/Zoho webhooks if applicable
        res.json({ received: true });
    } catch (error) {
        next(error);
    }
};

const getSuggestions = async (req, res, next) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit, 10) || 15;
        const suggestions = await emailSuggestionService.getSuggestions(query, limit);
        res.json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        logger.error(`[EMAIL CONTROLLER] Error fetching email suggestions: ${error.message}`);
        next(error);
    }
};

module.exports = {
    handleWebhook,
    getSuggestions,
};

