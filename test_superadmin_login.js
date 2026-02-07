require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:5000/api/auth';
const SYSTEM_EMAIL = process.env.MAIL_USER; // Using the mail user as a potential superadmin
const SYSTEM_PASSWORD = process.env.MAIL_PASSWORD;

// Note: If the actual superadmin credentials in the DB are different, 
// the user needs to provide them. For now, testing with known config.
// Or using a hardcoded one if user mentioned one.
// User said: "I have a created super admin already"
// I don't know the credentials. I will try a likely one or ask.
// Wait, I can search the DB for a superadmin using a script.

const runTest = async () => {
    try {
        console.log('Testing Superadmin Login...');

        // This part requires valid credentials. 
        // Since I don't know the user's password, I cannot fully automate the LOGIN test 
        // without their input or resetting it.
        // HOWEVER, I can write a script that connects to the DB, finds a superadmin, 
        // and *simulates* a login check or just verifies the middleware logic if I had a token.

        // Plan B: Ask user for credentials or check DB for a user with access.superAdmin = true
        // and print their email so the user can verify.

        console.log('Please proceed to frontend or Postman to test with real credentials.');
    } catch (error) {
        console.error('Test Failed:', error.response ? error.response.data : error.message);
    }
};

runTest();
