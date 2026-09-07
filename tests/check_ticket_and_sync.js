'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../models/index');

async function main() {
    try {
        console.log('Connecting to database...');
        const ticket = await prisma.ticket.findFirst({
            where: {
                OR: [
                    { ticketId: '1028' },
                    { ticketId: '#1028' }
                ]
            },
            include: { replies: true }
        });
        if (!ticket) {
            console.log('Ticket 1028 not found');
            return;
        }
        console.log(`Ticket ID: ${ticket.id} | Number: ${ticket.ticketId} | Subject: ${ticket.subject}`);
        console.log(`Total replies: ${ticket.replies.length}`);
        ticket.replies.forEach((r, idx) => {
            console.log(`[${idx + 1}] Type: ${r.type} | Author: ${r.author} | Time: ${r.time} ${r.date} | Category: ${r.category}`);
            console.log(`     Text: ${r.text.replace(/\r?\n/g, ' ').slice(0, 80)}...`);
            if (r.messageId) console.log(`     MessageId: ${r.messageId}`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
