const request = require('supertest');
const nodemailer = require('nodemailer');
const config = require('../config');
const helpers = require('../helpers');

// Helper to delay
const delay = ms => new Promise(res => setTimeout(res, ms));

describe('E2E: Email Flow (SMTP/IMAP)', () => {
    let token;
    const suffix = helpers.generateRandomString();
    const subject = `E2E Auto Ticket ${suffix}`;

    beforeAll(async () => {
        token = await helpers.login();
    });

    const headers = () => ({ 'Authorization': `Bearer ${token}` });

    test('Send Email -> Ticket Creation', async () => {
        // 1. Configure SMTP Transporter (Using credentials from config)
        // Ensure we are using the IT Admin credentials which should work for sending
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.zoho.in',
            port: process.env.SMTP_PORT || 465,
            secure: true, // true for 465
            auth: {
                user: config.email.user,
                pass: config.email.password
            }
        });

        // 2. Send Email
        try {
            await transporter.sendMail({
                from: config.email.user, // Self-send
                to: config.email.user,   // Send to self (backend monitors this inbox)
                subject: subject,
                text: `This is an automated E2E test to verify ticket creation.\nReference: ${suffix}`
            });
            console.log(`Email sent: ${subject}`);
        } catch (error) {
            console.error('SMTP Send Failed:', error);
            // If sending fails, we can't test creation. Fail the test.
            throw error;
        }

        // 3. Wait for IMAP to pick it up (Poll API)
        // Backend polls every X seconds? Or pushes?
        // `startImapListener` uses `idle` or periodic? `imap.on('mail')` is IDLE usually.
        // It relies on `imap.connect()`.

        // We'll poll the API for 60 seconds.
        let createdTicket = null;
        for (let i = 0; i < 12; i++) { // 12 * 5s = 60s
            await delay(5000); // Wait 5s

            const res = await request(config.baseURL).get('/api/tickets').set(headers());
            if (res.status === 200 && Array.isArray(res.body)) {
                // Look for ticket with our subject
                // Ticket header maps to subject?
                // Check `schema.prisma`: `header String`.
                // `ticketService` likely maps subject -> header.
                const found = res.body.find(t => t.header && t.header.includes(subject));
                if (found) {
                    createdTicket = found;
                    break;
                }
            }
        }

        if (!createdTicket) {
            throw new Error('Timeout: Ticket was not created within 60 seconds.');
        }

        expect(createdTicket).toBeTruthy();
        expect(createdTicket.header).toContain(subject);
        console.log(`Ticket Verified: ${createdTicket.ticketId}`);
    }, 90000); // 90s timeout for test
});
