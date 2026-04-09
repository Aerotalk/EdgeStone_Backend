require('dotenv').config();
const nodemailer = require('nodemailer');
const Imap = require('imap');

async function testEmail() {
    console.log("Testing SMTP (Sending)...");
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        tls: {
            ciphers: 'SSLv3'
        }
    });

    try {
        await transporter.verify();
        console.log("SMTP connection successful!");
        
        console.log("Sending a test email to self...");
        const info = await transporter.sendMail({
            from: process.env.MAIL_USER,
            to: process.env.MAIL_USER,
            subject: "Test Email from EdgeStone System",
            text: "If you are reading this, SMTP sending is working."
        });
        console.log("Test email sent successfully! Message ID:", info.messageId);
    } catch (err) {
        console.error("SMTP error:", err);
    }

    console.log("\nTesting IMAP (Receiving)...");
    const imap = new Imap({
        user: process.env.MAIL_USER,
        password: process.env.MAIL_PASSWORD,
        host: process.env.IMAP_HOST,
        port: process.env.IMAP_PORT,
        tls: process.env.IMAP_SECURE === 'true',
        tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', function() {
        console.log("IMAP connection successful!");
        imap.end();
    });

    imap.once('error', function(err) {
        console.error("IMAP error:", err);
    });

    imap.once('end', function() {
        console.log("IMAP connection ended.");
    });

    imap.connect();
}

testEmail();
