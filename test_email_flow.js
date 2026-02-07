require('dotenv').config();
const Imap = require('imap');
const nodemailer = require('nodemailer');
const simpleParser = require('mailparser').simpleParser;

// --- Configuration ---
const imapConfig = {
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    host: process.env.IMAP_HOST || 'imap.zoho.in',
    port: parseInt(process.env.IMAP_PORT) || 993,
    tls: process.env.IMAP_SECURE === 'true',
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000
};

const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtppro.zoho.in',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
    }
};

// --- Helpers ---
const transporter = nodemailer.createTransport(smtpConfig);

async function sendTestEmail() {
    console.log('1. Sending Test Email via SMTP...');
    const mailOptions = {
        from: `"Test Script" <${process.env.MAIL_USER}>`,
        to: process.env.MAIL_USER, // Send to self
        subject: 'IMAP/SMTP Flow Test ' + new Date().toISOString(),
        text: 'This is a test email to verify SMTP sending and IMAP receiving.'
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('   ✅ Email sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('   ❌ SMTP Error:', error);
        return false;
    }
}

function checkInboxForEmail() {
    console.log('2. Connecting to IMAP to check for email...');
    const imap = new Imap(imapConfig);

    imap.once('ready', function () {
        console.log('   ✅ IMAP Connected');
        imap.openBox('INBOX', false, function (err, box) {
            if (err) {
                console.error('   ❌ Error opening inbox:', err);
                imap.end();
                return;
            }
            console.log('   ✅ Inbox Open. Searching for recent messages...');

            // Search for unseen messages
            imap.search(['UNSEEN', ['SINCE', new Date()]], function (err, results) {
                if (err) {
                    console.error('   ❌ Search error:', err);
                    imap.end();
                    return;
                }

                if (!results || !results.length) {
                    console.log('   ⚠️ No new unseen messages found immediately.');
                    console.log('   Waiting for 10 seconds...');
                    // In a real scenario, we might use 'mail' event, but for simple test wait is ok
                    setTimeout(() => {
                        // Retry search or just end
                        console.log('   Ending test. Please check inbox manually if not found.');
                        imap.end();
                    }, 5000);
                    return;
                }

                console.log(`   ✅ Found ${results.length} new message(s). Fetching headers...`);
                const f = imap.fetch(results, { bodies: '' });
                f.on('message', function (msg, seqno) {
                    msg.on('body', function (stream, info) {
                        simpleParser(stream, async (err, parsed) => {
                            if (err) console.error(err);
                            console.log(`   📧 Received: "${parsed.subject}" from ${parsed.from.text}`);
                        });
                    });
                });
                f.once('error', function (err) {
                    console.error('Fetch error:', err);
                });
                f.once('end', function () {
                    console.log('   Done fetching messages.');
                    imap.end();
                });
            });
        });
    });

    imap.once('error', function (err) {
        console.error('   ❌ IMAP Connection Error:', err);
        if (err.textCode === 'ALERT') {
            console.error('   👉 POTENTIAL ROOT CAUSE: ' + err.source);
        }
    });

    imap.once('end', function () {
        console.log('   IMAP Connection ended');
    });

    imap.connect();
}

// --- Run ---
(async () => {
    const sent = await sendTestEmail();
    if (sent) {
        // Wait a couple seconds for delivery
        setTimeout(checkInboxForEmail, 3000);
    } else {
        console.log('Skipping IMAP check due to SMTP failure.');
    }
})();
