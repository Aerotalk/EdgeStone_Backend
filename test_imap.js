require('dotenv').config();
const Imap = require('imap');

const imap = new Imap({
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT) || 993,
    tls: process.env.IMAP_SECURE === 'true',
    tlsOptions: { rejectUnauthorized: false }, // Helpful for debugging
    debug: console.log // Log debug info from the module
});

function openInbox(cb) {
    imap.openBox('INBOX', true, cb);
}

imap.once('ready', function () {
    console.log('IMAP Connection Successful!');
    openInbox(function (err, box) {
        if (err) {
            console.error('Error opening inbox:', err);
        } else {
            console.log('Inbox opened successfully!');
            console.log('Total messages:', box.messages.total);
        }
        imap.end();
    });
});

imap.once('error', function (err) {
    console.error('IMAP Error:', err);
});

imap.once('end', function () {
    console.log('Connection ended');
});

console.log('Attempting to connect to IMAP...');
console.log(`Host: ${process.env.IMAP_HOST}`);
console.log(`User: ${process.env.MAIL_USER}`);

imap.connect();
