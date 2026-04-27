const asyncHandler = require('express-async-handler');
const aiService = require('../services/aiService');
const prisma = require('../models/index');

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

const extractSLAStart = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;

    // Fetch ticket and all replies
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { replies: { orderBy: { createdAt: 'asc' } } }
    });

    if (!ticket) {
        res.status(404);
        throw new Error('Ticket not found');
    }

    // Build chronological text context
    let contextText = `Ticket Opened by ${ticket.author} at ${ticket.receivedTime}:\n${ticket.header}\n${ticket.text}\n\n`;
    for (const reply of ticket.replies) {
        contextText += `Reply from ${reply.author} (${reply.type}) at ${reply.time}:\n${reply.text}\n\n`;
    }

    // Pass to AI for extraction
    const extraction = await aiService.extractSLAStartTimes(contextText);

    if (extraction.found) {
        // Automatically save to the DB!
        const updatedSla = await prisma.sLARecord.upsert({
            where: { ticketId: ticketId },
            create: {
                ticketId: ticketId,
                startDate: extraction.startDate,
                startTime: extraction.startTime,
                status: 'Safe',
                compensation: '-',
                statusReason: 'AI Extracted'
            },
            update: {
                startDate: extraction.startDate,
                startTime: extraction.startTime
            }
        });

        res.json({ success: true, sla: updatedSla });
    } else {
        res.json({ success: false, message: 'No concrete SLA start time found in the ticket history.' });
    }
});

module.exports = {
    processChat,
    extractSLAStart
};
