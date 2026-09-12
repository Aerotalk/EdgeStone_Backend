require('dotenv').config();
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const emailService = require('../services/emailService');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (!condition) {
        console.error(`  ❌ FAIL: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
}

async function runTest() {
    console.log('========================================================================');
    console.log('🧪 TEST: Client Mid-Conversation CC Reply Capture & Retention');
    console.log('========================================================================');

    const timestamp = Date.now();
    const clientEmail = `primary_client_${timestamp}@clientcorp.com`;
    const colleagueEmail = `alice_consultant_${timestamp}@externalpartner.com`;
    const circuitId = `CLIENT-CC-CKT-${timestamp}`;

    let createdClientId = null;
    let createdCircuitId = null;
    let createdTicketId = null;
    let capturedOutboundEmails = [];

    const origSendAgentReplyEmail = emailService.sendAgentReplyEmail;
    const origSendAutoReplyEmail = emailService.sendAutoReplyEmail;

    emailService.sendAutoReplyEmail = async () => true;
    emailService.sendAgentReplyEmail = async (emailData) => {
        capturedOutboundEmails.push(emailData);
        return {
            id: `graph-msg-${Date.now()}`,
            internetMessageId: `<test-agent-reply-${Date.now()}-${capturedOutboundEmails.length}@edgestone.in>`
        };
    };

    try {
        // 1. Seed Client and Circuit
        const client = await prisma.client.create({
            data: {
                name: `Client CC Test ${timestamp}`,
                emails: [clientEmail],
                createdOn: '10 Sep 2026'
            }
        });
        createdClientId = client.id;

        const circuit = await prisma.circuit.create({
            data: {
                customerCircuitId: circuitId,
                supplierCircuitId: `SUPP-CC-CKT-${timestamp}`,
                client: { connect: { id: client.id } }
            }
        });
        createdCircuitId = circuit.id;

        // 2. Client raises normal ticket
        console.log('\n--- Step 1: Client sends initial email ---');
        const rootMessageId = `<client-root-${timestamp}@clientcorp.com>`;
        const initialEmail = {
            from: clientEmail,
            to: ['marketing@edgestone.in'],
            subject: `Packet loss on link ${circuitId}`,
            text: `We are experiencing severe packet drops on circuit ${circuitId}.`,
            html: `<p>We are experiencing severe packet drops on circuit ${circuitId}.</p>`,
            messageId: rootMessageId,
            date: new Date().toISOString()
        };

        const ticket = await ticketService.createTicketFromEmail(initialEmail);
        assert(ticket && ticket.id, 'Ticket created');
        createdTicketId = ticket.id;
        assert(ticket.ticketType === 'Client', `Ticket type is Client: ${ticket.ticketType}`);
        assert(!ticket.ticketId.startsWith('#V'), `Ticket ID is normal client ticket: ${ticket.ticketId}`);

        // 3. Agent replies to client
        console.log('\n--- Step 2: Agent replies to client ---');
        capturedOutboundEmails = [];
        await ticketService.replyToTicket(
            ticket.id,
            'We are investigating packet drops on your circuit.',
            'agent@edgestone.in',
            'Support Engineer'
        );

        assert(capturedOutboundEmails.length === 1, 'Agent reply sent');
        const agentReply1 = capturedOutboundEmails[0];

        // 4. Client replies mid-conversation and adds colleague in CC
        console.log('\n--- Step 3: Client replies and ADDS colleague in CC ---');
        const clientFollowupMessageId = `<client-followup-${timestamp}@clientcorp.com>`;
        const clientFollowupEmail = {
            from: clientEmail,
            to: ['marketing@edgestone.in'],
            cc: [colleagueEmail], // Added mid-conversation by client!
            subject: `Re: [${ticket.ticketId}] Packet loss on link ${circuitId}`,
            text: `Looping in our external network consultant Alice (${colleagueEmail}). Circuit is still down.`,
            html: `<p>Looping in our external network consultant Alice (${colleagueEmail}). Circuit is still down.</p>`,
            messageId: clientFollowupMessageId,
            inReplyTo: agentReply1.messageId || rootMessageId,
            references: `${rootMessageId} ${agentReply1.messageId || ''}`.trim(),
            date: new Date().toISOString()
        };

        const followupResult = await ticketService.createTicketFromEmail(clientFollowupEmail);
        assert(followupResult && followupResult.ticketId === ticket.id, 'Client follow-up appended to same ticket');

        // Check that ticket.cc in DB now contains the client-added CC email
        const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
        const ccList = (updatedTicket.cc || []).map(e => e.toLowerCase().trim());
        console.log(`    Ticket CC list in DB: ${JSON.stringify(ccList)}`);
        assert(ccList.includes(colleagueEmail.toLowerCase().trim()), `Ticket CC list retained client-added CC: ${colleagueEmail}`);

        // 5. The CCed person (Alice) replies directly from her email!
        console.log('\n--- Step 4: CCed person (Alice) replies directly to ticket ---');
        const colleagueReplyMessageId = `<alice-reply-${timestamp}@externalpartner.com>`;
        const colleagueReplyEmail = {
            from: colleagueEmail, // Sender is NOT in client.emails initially, was added to CC mid-conversation
            to: ['marketing@edgestone.in'],
            cc: [clientEmail],
            subject: `Re: [${ticket.ticketId}] Packet loss on link ${circuitId}`,
            text: `Hi EdgeStone Support, Alice here. I took packet captures on our router and see 40% loss at hop 3. Circuit ${circuitId}.`,
            html: `<p>Hi EdgeStone Support, Alice here. I took packet captures on our router and see 40% loss at hop 3. Circuit ${circuitId}.</p>`,
            messageId: colleagueReplyMessageId,
            inReplyTo: clientFollowupMessageId,
            references: `${rootMessageId} ${clientFollowupMessageId}`.trim(),
            date: new Date().toISOString()
        };

        const colleagueResult = await ticketService.createTicketFromEmail(colleagueReplyEmail);
        assert(colleagueResult && colleagueResult.ticketId === ticket.id, 'CCed person reply matched and appended to existing Ticket');

        // Verify the reply is in the client thread and NOT misrouted to vendor
        const refreshedTicket = await prisma.ticket.findUnique({
            where: { id: ticket.id },
            include: { replies: { orderBy: { createdAt: 'asc' } } }
        });
        const allReplies = refreshedTicket.replies || [];
        const lastReply = allReplies[allReplies.length - 1];

        assert(lastReply !== undefined, 'Reply exists in ticket');
        assert(lastReply.type === 'client', `Reply type is 'client' (not vendor): ${lastReply.type}`);
        assert(lastReply.author.includes(colleagueEmail) || lastReply.author.includes('Alice') || lastReply.text.includes('Alice here'), 'Reply content matches CCed person');

        // 6. Agent replies again -> verify both client AND CCed person are included in outbound email
        console.log('\n--- Step 5: Agent replies -> verify CCed person receives email ---');
        capturedOutboundEmails = [];
        await ticketService.replyToTicket(
            ticket.id,
            'Thank you Alice for the router logs. We are escalating to our upstream.',
            'agent@edgestone.in',
            'Support Engineer'
        );

        assert(capturedOutboundEmails.length === 1, 'Agent reply sent');
        const agentReply2 = capturedOutboundEmails[0];
        const outboundCc = (agentReply2.cc || []).map(e => e.toLowerCase().trim());
        console.log(`    Agent outbound CC: ${JSON.stringify(outboundCc)}`);
        assert(outboundCc.includes(colleagueEmail.toLowerCase().trim()), `Outbound CC includes client-added recipient ${colleagueEmail}`);

        console.log('\n========================================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} CLIENT-ADDED CC REPLY TESTS PASSED!`);
        console.log('========================================================================\n');

    } catch (err) {
        console.error('❌ Client-added CC reply test failed:', err);
        throw err;
    } finally {
        emailService.sendAgentReplyEmail = origSendAgentReplyEmail;
        emailService.sendAutoReplyEmail = origSendAutoReplyEmail;
        console.log('🧹 Cleaning up test records...');
        if (createdTicketId) {
            await prisma.reply.deleteMany({ where: { ticketId: createdTicketId } }).catch(() => {});
            await prisma.activityLog.deleteMany({ where: { ticketId: createdTicketId } }).catch(() => {});
            await prisma.sLARecord.deleteMany({ where: { ticketId: createdTicketId } }).catch(() => {});
            await prisma.ticket.deleteMany({ where: { id: createdTicketId } }).catch(() => {});
        }
        if (createdCircuitId) {
            await prisma.circuit.delete({ where: { id: createdCircuitId } }).catch(() => {});
        }
        if (createdClientId) {
            await prisma.client.delete({ where: { id: createdClientId } }).catch(() => {});
        }
        console.log('✅ Cleanup complete.');
    }
}

runTest().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
