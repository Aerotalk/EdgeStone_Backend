const nodemailer = require('nodemailer');
require('dotenv').config();

async function testSMTP() {
    console.log('Testing SMTP Sending...');
    const transporter = nodemailer.createTransport({
        host: 'smtp.zeptomail.in',
        port: 587,
        secure: false,
        auth: {
            user: 'emailapikey',
            pass: process.env.ZEPTO_TOKEN // using the long password provided
        }
    });

    try {
        const info = await transporter.sendMail({
            from: '"EdgeStone Support" <no-reply@edgestone.in>',
            to: 'it@edgestone.in',
            subject: 'SMTP Integration Test',
            text: 'This is a test email via SMTP/Nodemailer.',
        });
        console.log('Test Email Sent Successfully:', info.messageId);
    } catch (error) {
        console.error('Test Email Failed:', error);
    }
}

testSMTP();
