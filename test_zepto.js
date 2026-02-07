const emailService = require('./services/emailService');
require('dotenv').config();

async function testSend() {
    console.log('Testing ZeptoMail Sending...');
    try {
        await emailService.sendEmail({
            to: 'it@edgestone.in', // Send to self/support for testing
            subject: 'ZeptoMail Integration Test',
            text: 'This is a test email from the EdgeStone Backend to verify ZeptoMail integration.',
            html: '<h3>ZeptoMail Integration Test</h3><p>This is a test email to verify <b>ZeptoMail</b> integration.</p>'
        });
        console.log('Test Email Sent Successfully.');
    } catch (error) {
        console.error('Test Email Failed:', error);
    }
}

testSend();
