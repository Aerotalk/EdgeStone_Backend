const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const TicketModel = require('../models/ticket');
const prisma = require('../models/index');
const workNoteService = require('./workNoteService');
const slaService = require('./slaService');

// Initialize OpenAI conditionally if key exists
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
} else {
    logger.warn('⚠️ [AI] OPENAI_API_KEY is not defined. AI features will be disabled.');
}

/**
 * Parses email subject and body to identify if a Circuit ID exists.
 * Strictly requires the Circuit ID to be in the provided validCircuitIds.
 *
 * @param {string} subject 
 * @param {string} body
 * @param {Array<string>} validCircuitIds - Extracted from the database.
 * @returns {Promise<{ foundIn: 'subject' | 'body' | 'none', circuitId: string | null }>}
 */
const analyzeEmailForCircuitId = async (subject, body, validCircuitIds) => {
    if (!openai) {
        return { foundIn: 'none', circuitId: null };
    }

    try {
        const prompt = `
        You are an intelligent email parser for a support ticketing system.
        We have a strict list of valid Circuit IDs: ${JSON.stringify(validCircuitIds)}.
        
        Analyze the following email SUBJECT and BODY.
        Determine if exactly one of the valid Circuit IDs is mentioned.
        If it's mentioned in the SUBJECT, return "subject".
        If it's ONLY mentioned in the BODY (and not the subject), return "body".
        If it doesn't match any of the valid Circuit IDs exactly, return "none".
        
        Respond ONLY with a valid JSON strictly structured as:
        { "foundIn": "subject" | "body" | "none", "circuitId": "ID or null" }
        `;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: `SUBJECT: ${subject}\n\nBODY: ${body}` } // Provide user context
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const result = JSON.parse(response.choices[0].message.content);
        return result;
    } catch (error) {
        logger.error(`🚨 [AI] Error analyzing email for circuit ID: ${error.message}`);
        return { foundIn: 'none', circuitId: null };
    }
};

const resolveTicketUUID = async (prisma, ticketIdArg) => {
    // If it is a standard UUID format, return it
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketIdArg)) {
        return ticketIdArg;
    }
    
    // Assume it's a human readable ID like #1080 or 1080
    // Try both #1080 and 1080 (add # if missing)
    const normalizedId = ticketIdArg.startsWith('#') ? ticketIdArg : `#${ticketIdArg}`;
    
    const ticket = await prisma.ticket.findFirst({
        where: { ticketId: normalizedId }
    });
    
    if (ticket) return ticket.id;
    throw new Error(`Could not find a ticket in the database matching ID ${normalizedId}`);
};

/**
 * Handle incoming user chatbot queries, inject tools for context.
 */
const processChatbotQuery = async (messages, userTimezone = 'Asia/Kolkata') => {
    if (!openai) {
        throw new Error("OpenAI API is not configured.");
    }

    try {
        const systemPrompt = `
        You are "EdgeStone Assistant", an expert AI helper built into the EdgeStone ticketing system.
        You have direct access to our database through the tools provided.
        Your goal is to assist agents in managing tasks, pulling logs, checking SLA breaches, and tracking tickets.
        
        IMPORTANT RULES:
        1. Always be professional, concise, and helpful. Do not use markdown unless formatting a list or table.
        2. The user's local timezone is: ${userTimezone}. If you retrieve timestamps from the database (which might be GMT or specific strings), YOU MUST mathematically translate and output them into the user's timezone (${userTimezone}).
        3. Only use the tools provided if necessary to answer the user's question.
        4. When talking about SLAs, if requested you can detect breaches using the SLA tool.
        `;

        const tools = [
            {
                type: "function",
                function: {
                    name: "fetchRecentTickets",
                    description: "Retrieve a summary of the most recently created tickets.",
                    parameters: {
                        type: "object",
                        properties: {
                            limit: { type: "integer", description: "How many tickets to fetch." }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "fetchWorkLogs",
                    description: "Fetch all internal work notes and logs for a specific ticket.",
                    parameters: {
                        type: "object",
                        properties: {
                            ticketId: { type: "string", description: "The ticket ID. Can be the human-readable ID (like #1080 or 1080) or the internal UUID." }
                        },
                        required: ["ticketId"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "checkSlaStatus",
                    description: "Fetch SLA Record status for a ticket, to easily detect SLA breaches.",
                    parameters: {
                        type: "object",
                        properties: {
                            ticketId: { type: "string", description: "The ticket ID. Can be the human-readable ID (like #1080 or 1080) or the internal UUID." }
                        },
                        required: ["ticketId"]
                    }
                }
            }
        ];

        // Format message history
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        let response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: apiMessages,
            tools: tools,
            tool_choice: "auto"
        });

        let responseMessage = response.choices[0].message;

        // Automatically resolve tool calls
        if (responseMessage.tool_calls) {
            apiMessages.push(responseMessage); // Add assistant's tool call intent

            for (const toolCall of responseMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                let functionResult = "";

                try {
                    if (functionName === "fetchRecentTickets") {
                        const limit = args.limit || 5;
                        const ticks = await prisma.ticket.findMany({ take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, ticketId: true, header: true, status: true, circuitId: true } });
                        functionResult = JSON.stringify(ticks);
                    } else if (functionName === "fetchWorkLogs") {
                        const uuid = await resolveTicketUUID(prisma, args.ticketId);
                        const logs = await workNoteService.getWorkNotes(uuid);
                        functionResult = JSON.stringify(logs);
                    } else if (functionName === "checkSlaStatus") {
                        const uuid = await resolveTicketUUID(prisma, args.ticketId);
                        const slaRec = await prisma.sLARecord.findUnique({ where: { ticketId: uuid }});
                        functionResult = JSON.stringify(slaRec || { error: `No SLA Record found for ticket ${args.ticketId}.` });
                    }
                } catch (e) {
                    functionResult = JSON.stringify({ error: e.message });
                }

                apiMessages.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: functionName,
                    content: functionResult,
                });
            }

            // Second call with tool results
            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: apiMessages,
            });

            return secondResponse.choices[0].message.content;
        }

        return responseMessage.content;
    } catch (error) {
        logger.error(`🚨 [AI] Chatbot Query Error: ${error.message}`);
        throw error;
    }
};

module.exports = {
   analyzeEmailForCircuitId,
   processChatbotQuery
};
