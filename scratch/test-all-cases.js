require('dotenv').config();
const { OpenAI } = require('openai');
const openai = new OpenAI();

const analyzeEmailForCircuitIdTest = async (subject, body, validCircuitIds) => {
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
            { role: 'user', content: `SUBJECT: ${subject}\n\nBODY: ${body}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0,
    });

    return JSON.parse(response.choices[0].message.content);
};

(async () => {
    const validCircuitIds = ["BA/SNG-CHK/ESPL-002", "TEST/001"];

    const cases = [
        { name: "1. Only in Subject", subject: "LINK DOWN BA/SNG-CHK/ESPL-002", body: "Please help." },
        { name: "2. Only in Body", subject: "LINK DOWN", body: "Circuit: BA/SNG-CHK/ESPL-002 is down." },
        { name: "3. In Both", subject: "LINK DOWN BA/SNG-CHK/ESPL-002", body: "Circuit: BA/SNG-CHK/ESPL-002 is down." },
        { name: "4. Missing completely", subject: "LINK DOWN", body: "My internet is down." },
        { name: "5. Empty body, ID in subject", subject: "BA/SNG-CHK/ESPL-002", body: "" }
    ];

    for (let c of cases) {
        const res = await analyzeEmailForCircuitIdTest(c.subject, c.body, validCircuitIds);
        console.log(`${c.name} -> foundIn: ${res.foundIn}, circuitId: ${res.circuitId}`);
    }
})();
