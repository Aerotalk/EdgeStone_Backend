'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const emailService = require('../services/emailService');
const prisma = require('../models/index');

async function run() {
    try {
        console.log('--- Triggering fetchNewGraphEmails() ---');
        await emailService.fetchNewGraphEmails();
        console.log('--- Poller run complete. Checking Ticket #1028 in database ---');

        const ticket = await prisma.ticket.findFirst({
            where: {
                OR: [
                    { ticketId: '1028' },
                    { ticketId: '#1028' }
                ]
            },
            include: { replies: true }
        });

        console.log(`Ticket #1028 has ${ticket.replies.length} replies:`);
        ticket.replies.forEach((r, idx) => {
            console.log(`[${idx + 1}] Type: ${r.type} | Author: ${r.author} | Time: ${r.time} ${r.date} | Category: ${r.category}`);
            console.log(`     Text: ${r.text.replace(/\r?\n/g, ' ').slice(0, 100)}...`);
            if (r.messageId) console.log(`     MessageId: ${r.messageId}`);
        });

        const targetReply = ticket.replies.find(r => r.text.includes('No Issue Sir the Problem is tracked'));
        if (targetReply) {
            console.log('\n SUCCESS: Outlook reply successfully found in ticket replies!');
            console.log('Reply ID:', targetReply.id);
            console.log('Author:', targetReply.author);
            console.log('Type:', targetReply.type);
            console.log('Time:', targetReply.time, targetReply.date);
            console.log('Category:', targetReply.category);
        } else {
            console.error('\n❌ FAILED: Outlook reply not found in ticket replies.');
        }

    } catch (err) {
        console.error('Error during test:', err);
    } finally {
        await prisma.$disconnect();
    }
}

run();
