const nodemailer = require('nodemailer');
const emailConfig = require('./config/emailConfig');
const logger = require('./utils/logger');

const transporter = nodemailer.createTransport(emailConfig.smtp);

async function testConnection() {
    console.log("Testing SMTP Connection Configuration...");
    console.log(`Host: ${emailConfig.smtp.host}`);
    console.log(`Port: ${emailConfig.smtp.port}`);
    console.log(`User: ${emailConfig.smtp.auth.user}`);
    console.log(`Secure: ${emailConfig.smtp.secure}`);
    
    try {
        console.log("\nVerifying connection...");
        const success = await transporter.verify();
        if (success) {
            console.log("✅ SUCCESS: The SMTP connection is established and the server is ready to take our messages.");
            
            // Send a test email to self
            console.log("\nSending test email...");
            const info = await transporter.sendMail({
                from: `EdgeStone Support <${emailConfig.smtp.auth.user}>`,
                to: emailConfig.smtp.auth.user, // Send to self
                subject: 'Ticketing System - SMTP Test ✔',
                text: 'Hello from EdgeStone Ticketing System! Your SMTP connection is working perfectly.',
                html: '<b>Hello from EdgeStone Ticketing System!</b><br>Your SMTP connection is working perfectly.'
            });
            console.log(`✅ SUCCESS: Test email sent! Message ID: ${info.messageId}`);
        }
    } catch (error) {
        console.error("❌ ERROR: Connection failed.");
        console.error(error);
    }
}

testConnection().then(() => process.exit(0)).catch(() => process.exit(1));
