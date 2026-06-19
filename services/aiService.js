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
        Find exactly which valid Circuit ID is mentioned.
        
        Rules for "foundIn":
        1. Does the SUBJECT line contain the Circuit ID? If YES, return "subject".
        2. Does the BODY text contain the Circuit ID, AND the SUBJECT line does NOT? If YES, return "body".
        3. If neither contain a valid Circuit ID, return "none".
        
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
        You are "Keery", the Smart Personal Assistant for all EdgeStone Employees.
        You are an expert AI built directly into the EdgeStone ticketing system.
        You have direct access to our database through the tools provided.
        Your goal is to analyze every ticket, assist agents in managing tasks, pulling logs, checking SLA breaches, and tracking tickets.
        
        IMPORTANT RULES:
        1. Always be professional, concise, friendly, and extremely helpful. Introduce yourself as Keery when appropriate.
        2. The user's local timezone is: ${userTimezone}. If you retrieve timestamps from the database, YOU MUST mathematically translate and output them into the user's timezone (${userTimezone}).
        3. Only use the tools provided if necessary to answer the user's question.
        4. When asked to compose an email, generate a highly professional and context-aware email draft that the agent can use.
        5. You have a tool to post handover notes to the global sticky notes. Use it when an agent asks to prepare a shift handover.
        6. Act as a proactive assistant—if you see SLA breaches or missing information, highlight it for the agent.
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
            },
            {
                type: "function",
                function: {
                    name: "generateAndPostHandoverNote",
                    description: "Automatically compile a summary of the ticket's status, generate a professional handover note, and instantly post it to the ticket's work logs.",
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
                    } else if (functionName === "generateAndPostHandoverNote") {
                        const uuid = await resolveTicketUUID(prisma, args.ticketId);
                        const ticket = await prisma.ticket.findUnique({ where: { id: uuid }, include: { replies: true }});
                        const workNotes = await workNoteService.getWorkNotes(uuid);
                        
                        let contextText = `TICKET START:\nSubject: ${ticket.header}\nBody: ${ticket.text}\n\nREPLIES:\n`;
                        ticket.replies.forEach(r => contextText += `[${r.author}]: ${r.text}\n`);
                        contextText += `\nWORK NOTES:\n`;
                        workNotes.forEach(w => contextText += `[${w.author}]: ${w.text}\n`);

                        const handoverPrompt = `
                        You are an AI generating a shift handover note for the next support agent.
                        Based on the following ticket history, write a clear, concise (3-4 bullet points max) summary.
                        Include:
                        - Ticket Context/Status
                        - What was done
                        - What the next shift agent needs to do.
                        Keep it extremely professional. Do not wrap in markdown quotes. Just pure text.
                        `;

                        const noteRes = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [
                                { role: "system", content: handoverPrompt },
                                { role: "user", content: contextText }
                            ],
                            temperature: 0.3
                        });

                        const handoverText = noteRes.choices[0].message.content;
                        
                        // First, save it to the individual ticket's work logs for auditing
                        await workNoteService.createWorkNote(uuid, handoverText, null, 'Keery (Handover)', true);
                        
                        // Second, POST it globally to the Global Sticky Note (Shift Handover)
                        const currentGlobalNote = await prisma.globalNote.findUnique({ where: { id: 'global-note' } });
                        const existingContent = currentGlobalNote ? currentGlobalNote.content : '';
                        
                        // Append the new ticket handover to the existing global note
                        const newGlobalContent = existingContent 
                            ? `${existingContent}\n\n--- [Ticket ${ticket.ticketId} Handover] ---\n${handoverText}` 
                            : `--- [Ticket ${ticket.ticketId} Handover] ---\n${handoverText}`;

                        await prisma.globalNote.upsert({
                            where: { id: 'global-note' },
                            update: { content: newGlobalContent, updatedBy: 'Keery' },
                            create: { id: 'global-note', content: newGlobalContent, updatedBy: 'Keery' }
                        });
                        
                        functionResult = JSON.stringify({
                            success: true,
                            message: "Handover note generated and posted to the Global Sticky Note.",
                            noteContent: handoverText
                        });
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

/**
 * Analyze ticket content to extract SLA start times automatically.
 * @param {string} text - Concatenated email history/vendor notes.
 * @returns {Promise<{ found: boolean, startDate: string, startTime: string }>}
 */
const extractSLAStartTimes = async (text) => {
    if (!openai) {
        throw new Error("OpenAI is disabled.");
    }
    
    try {
        const prompt = `
        You are an intelligent SLA parser. Read the following ticket discussion thread.
        Find the EXACT downtime start date and time mentioned by the vendor or system indicating when the issue began.
        If found, format startDate as "DD MMM YYYY" (e.g. 10 Nov 2026).
        Format startTime in 24-hour HH:MM format with " hrs" appended (e.g. "14:30 hrs").
        If no such time is clearly found, return "found": false.
        
        Strictly respond with JSON:
        { "found": boolean, "startDate": "DD MMM YYYY", "startTime": "HH:MM hrs" }
        `;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: text }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (e) {
        logger.error(`🚨 [AI] Error extracting SLA start time: ${e.message}`);
        return { found: false };
    }
};

/**
 * Generate a polite response using OpenAI to ask a customer for their missing Circuit ID.
 * @param {string} fromName 
 * @param {string} subject 
 * @param {string} body 
 * @returns {Promise<string>}
 */
const generateMissingCircuitIdReply = async (fromName, subject, body) => {
    if (!openai) {
        return `Hello ${fromName || 'Customer'},\n\nWe received your request but couldn't proceed because a valid Circuit ID was missing. Please reply with your Circuit ID so we can assist you.\n\nThank you,\nEdgeStone Support`;
    }
    
    try {
        const prompt = `
        You are a polite customer support AI for EdgeStone ticketing system.
        A valid customer has sent an email requesting support, but they forgot to include their Circuit ID (which is strictly required to open a ticket).
        
        Write a short, professional, and extremely polite email reply back to the customer.
        The reply should:
        1. Acknowledge their issue gently.
        2. Politely apologize and inform them that we cannot proceed without a valid Circuit ID.
        3. Ask them to reply with a valid Circuit ID to successfully raise the support ticket.
        4. Sign off as "EdgeStone AI Router".
        
        IMPORTANT: Return ONLY the plain text email body. Use standard newlines (not HTML). Do not include subject lines or metadata.
        `;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: `Customer Name: ${fromName || 'Customer'}\nSubject: ${subject}\nEmail Body: ${body}` }
            ],
            temperature: 0.7,
        });

        return response.choices[0].message.content.trim();
    } catch (e) {
        logger.error(`🚨 [AI] Error generating polite reply: ${e.message}`);
        return `Hello ${fromName || 'Customer'},\n\nWe received your request but couldn't proceed because a valid Circuit ID was missing. Please reply with your Circuit ID so we can assist you.\n\nThank you,\nEdgeStone Support`;
    }
};

/**
 * Generate a polite response using OpenAI to warn a customer to put their Circuit ID in the subject line next time.
 * @param {string} fromName 
 * @param {string} circuitId 
 * @returns {Promise<string>}
 */
const generateBodyCircuitIdWarning = async (fromName, circuitId) => {
    if (!openai) {
        return `Hello ${fromName || 'Customer'},\n\nWe have successfully processed your request and created a ticket based on the Circuit ID (${circuitId}) located in the body of your email.\n\nPlease mention the Circuit ID in the subject line from next time to ensure faster and perfectly accurate routing.\n\nThank you,\nEdgeStone Support`;
    }
    
    try {
        const prompt = `
        You are a polite customer support AI for EdgeStone ticketing system.
        A valid customer has sent an email requesting support. They included their Circuit ID (${circuitId}), but they put it in the BODY of the email instead of the SUBJECT line.
        We have successfully created the ticket anyway, but we need to gently remind them to use the subject line next time.
        
        Write a short, professional, and extremely polite email reply back to the customer.
        The reply should:
        1. Acknowledge their issue and confirm that their ticket HAS been created successfully using the Circuit ID (${circuitId}) found in the email body.
        2. Politely request that they mention the Circuit ID in the SUBJECT line for all future requests to ensure faster routing.
        3. Sign off as "EdgeStone AI Router".
        
        IMPORTANT: Return ONLY the plain text email body. Use standard newlines (not HTML). Do not include subject lines or metadata.
        `;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: `Customer Name: ${fromName || 'Customer'}` }
            ],
            temperature: 0.7,
        });

        return response.choices[0].message.content.trim();
    } catch (e) {
        logger.error(`🚨 [AI] Error generating warning reply: ${e.message}`);
        return `Hello ${fromName || 'Customer'},\n\nWe have successfully processed your request and created a ticket based on the Circuit ID (${circuitId}) located in the body of your email.\n\nPlease mention the Circuit ID in the subject line from next time to ensure faster and perfectly accurate routing.\n\nThank you,\nEdgeStone Support`;
    }
};

/**
 * Analyzes the current roadmap (circuits, tickets, SLAs) and returns a structured AI summary.
 * @param {Object} roadmapData 
 * @returns {Promise<string>}
 */
const analyzeRoadmapState = async (roadmapData) => {
    if (!openai) {
        return "AI analysis disabled. Missing OPENAI_API_KEY.";
    }

    try {
        const prompt = `
        You are "Keery", the intelligent network operations AI for EdgeStone.
        You are looking at a live map of the company's network circuits, open support tickets, and SLA records.
        
        Analyze the following roadmap data and provide a concise, high-level "System Health Summary" for the agents.
        Highlight:
        1. Any critical hotspots (e.g., multiple open tickets on the same vendor or circuit).
        2. Any breached or at-risk SLAs.
        3. A general mood/health assessment (Healthy, Warning, Critical).
        
        Keep it brief, professional, and visually formatted with markdown emojis. Do not exceed 4-5 sentences or bullet points.
        `;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: JSON.stringify(roadmapData) }
            ],
            temperature: 0.3,
        });

        return response.choices[0].message.content.trim();
    } catch (e) {
        logger.error(\`🚨 [AI] Error analyzing roadmap state: \${e.message}\`);
        return "AI analysis currently unavailable due to an error.";
    }
};

module.exports = {
   analyzeEmailForCircuitId,
   processChatbotQuery,
   extractSLAStartTimes,
   generateMissingCircuitIdReply,
   generateBodyCircuitIdWarning,
   analyzeRoadmapState
};
