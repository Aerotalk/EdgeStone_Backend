const { Resend } = require('resend');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const OUT_FILE = 'test_resend_result.json';

(async () => {
    console.log('🚀 Attempting to send test email via Resend...');

    try {
        const data = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to: [process.env.RESEND_FROM_EMAIL],
            subject: 'Resend Integration Test - Root Domain',
            html: '<strong>It works!</strong> <p>This email was sent via Resend from the root domain.</p>',
        });

        // Write EVERYTHING to file, success or error
        fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));

        if (data.error) {
            console.error('❌ Resend API returned an error:', data.error);
        } else {
            console.log('✅ Email sent successfully!');
            console.log('🆔 Email ID:', data.data && data.data.id);
        }
    } catch (error) {
        console.error('❌ Unexpected Error:', error);
        fs.writeFileSync(OUT_FILE, JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
    }
})();
