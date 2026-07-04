require('dotenv').config();
const { analyzeEmailForCircuitId } = require('./services/aiService');

(async () => {
    const subject = "LINK DOWN PLEASE LOOK AFTER FOR CURCUIT ID || BA/SNG-CHK/ESPL-002";
    const body = "";
    const validCircuitIds = ["BA/SNG-CHK/ESPL-002", "OTHER/123", "TEST/001"];

    const result = await analyzeEmailForCircuitId(subject, body, validCircuitIds);
    console.log("RESULT:", result);
})();
