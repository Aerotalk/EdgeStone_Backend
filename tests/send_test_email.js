const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Test email configuration
const testConfig = {
    from: process.env.MAIL_USER,
    to: process.env.MAIL_USER, // Send to yourself for testing
    subject: '12345678 || TEST-CIRCUIT-001',
    text: `This is a test email to verify the ticketing system.

Please verify:
1. Ticket is created in the database
2. Ticket appears in the frontend
3. Email body is displayed correctly (not hardcoded text)
4. Auto-reply is sent after 30 seconds
5. Agent can reply and email is received

Test timestamp: ${new Date().toISOString()}`
};

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
    }
});

async function sendTestEmail() {
    try {
        console.log('📧 Sending test email...');
        console.log(`From: ${testConfig.from}`);
        console.log(`To: ${testConfig.to}`);
        console.log(`Subject: ${testConfig.subject}`);

        const info = await transporter.sendMail(testConfig);

        console.log('✅ Test email sent successfully!');
        console.log(`Message ID: ${info.messageId}`);
        console.log('\n📋 Next steps:');
        console.log('1. Wait for IMAP to receive the email (check backend logs)');
        console.log('2. Check frontend for new ticket');
        console.log('3. Click ticket to verify email body is displayed');
        console.log('4. Wait 30 seconds for auto-reply');
        console.log('5. Test agent reply functionality');

    } catch (error) {
        console.error('❌ Error sending test email:', error.message);
        process.exit(1);
    }
}

sendTestEmail();
