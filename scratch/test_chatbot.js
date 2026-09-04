require('dotenv').config();
const aiService = require('../services/aiService');

async function testChat() {
    console.log("Testing processChatbotQuery...");
    try {
        const result = await aiService.processChatbotQuery([{ role: "user", content: "Show me recent tickets" }]);
        console.log("Chatbot Result:", result);
    } catch (err) {
        console.error("Chatbot Error:", err);
    }
}

testChat();
