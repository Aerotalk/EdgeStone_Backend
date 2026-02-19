const { getISTDate, getISTString, getISTISOString } = require('../utils/timeUtils');

console.log("Testing IST Time Utility:");
console.log("Current System Time:", new Date().toString());
console.log("IST Date Object:", getISTDate().toString());
console.log("IST String:", getISTString());
console.log("IST ISO String:", getISTISOString());

console.log("\nIf the IST String matches the current time in India (GMT+5:30), then it is working correctly.");
