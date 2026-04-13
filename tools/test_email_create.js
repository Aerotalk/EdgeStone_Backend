const ticketService = require('../services/ticketService');
const mongoose = require('mongoose');

async function test() {
    console.log('Testing createTicketFromEmail...');
    try {
        const ticket = await ticketService.createTicketFromEmail({
             from: 'test@client.com',
             fromName: 'Test Client',
             subject: 'Urgent issue with BA/SNG-TY2/ESPL-003',
             body: 'Hello, the circuit is down',
             date: new Date(),
             messageId: 'test-123',
             inReplyTo: null,
             references: null
        });
        console.log('Result:', ticket ? ticket.ticketId : 'Dropped/Null');
    } catch(e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

test();
