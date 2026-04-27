const asyncHandler = require('express-async-handler');
const aiService = require('../services/aiService');

/**
 * @desc    Process Chatbot AI queries
 * @route   POST /api/ai/chat
 * @access  Private 
 */
const processChat = asyncHandler(async (req, res) => {
    const { messages, timezone } = req.body;

    if (!messages || !Array.isArray(messages)) {
        res.status(400);
        throw new Error('Messages array is required');
    }

    const aiResponse = await aiService.processChatbotQuery(messages, timezone);
    res.json({ reply: aiResponse });
});

module.exports = {
    processChat
};
