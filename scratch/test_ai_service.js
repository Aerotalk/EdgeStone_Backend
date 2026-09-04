require('dotenv').config();
const aiService = require('../services/aiService');

async function testAI() {
    console.log("Testing analyzeEmailForCircuitId...");
    try {
        const result = await aiService.analyzeEmailForCircuitId(
            "Issue with Circuit N1/SCM/2027", 
            "Hello, my circuit is down.", 
            ["N1/SCM/2027", "N1/SCN/2027"]
        );
        console.log("Result:", result);
        
        console.log("\nTesting generateMissingCircuitIdReply...");
        const reply = await aiService.generateMissingCircuitIdReply("John Doe", "Network Down", "The internet is not working.");
        console.log("Reply:", reply);

        console.log("\nAI Service tests completed successfully!");
    } catch (err) {
        console.error("AI Service test failed:", err);
    }
}

testAI();
