'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const emailService = require('../services/emailService');

async function runTests() {
    console.log('================================================================');
    console.log('🧪 VERIFYING STRICT CLIENT & CIRCUIT ISOLATION (NO MIXING)');
    console.log('================================================================\n');

    // Mock outbound emails to avoid hitting SMTP
    emailService.sendAgentReplyEmail = async () => ({ messageId: `<test-${Date.now()}@edgestone.in>` });
    emailService.sendAutoReplyEmail = async () => ({ messageId: `<test-auto-${Date.now()}@edgestone.in>` });
    emailService.sendEmailViaGraph = async () => ({ messageId: `<test-g-${Date.now()}@edgestone.in>` });

    let totalTests = 0;
    let passedTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    const createdTicketIds = [];
    const createdCircuitIds = [];
    const createdClientIds = [];
    const createdVendorIds = [];

    try {
        // 1. Setup Test Clients
        const client1Email = `client1_isolation_${Date.now()}@clientone.com`;
        const client2Email = `client2_isolation_${Date.now()}@clienttwo.com`;
        const vendorEmail = `vendor_isolation_${Date.now()}@telecomvendor.com`;

        const client1 = await prisma.client.create({
            data: {
                name: 'Isolation Client One',
                emails: [client1Email],
                status: 'Active',
                createdOn: '08 Sep 2026'
            }
        });
        createdClientIds.push(client1.id);

        const client2 = await prisma.client.create({
            data: {
                name: 'Isolation Client Two',
                emails: [client2Email],
                status: 'Active',
                createdOn: '08 Sep 2026'
            }
        });
        createdClientIds.push(client2.id);

        const vendor = await prisma.vendor.create({
            data: {
                name: 'Isolation Telecom Vendor',
                emails: [vendorEmail],
                status: 'Active',
                createdOn: '08 Sep 2026'
            }
        });
        createdVendorIds.push(vendor.id);

        // 2. Setup Test Circuits
        const ckt1A = `ISO-CKT-CLIENT1-PRIMARY-${Date.now()}`;
        const ckt1B = `ISO-CKT-CLIENT1-SECONDARY-${Date.now()}`;
        const ckt2A = `ISO-CKT-CLIENT2-MAIN-${Date.now()}`;

        const circuit1A = await prisma.circuit.create({
            data: {
                customerCircuitId: ckt1A,
                supplierCircuitId: `SUP-1A-${Date.now()}`,
                clientId: client1.id,
                vendorId: vendor.id
            }
        });
        createdCircuitIds.push(circuit1A.id);

        const circuit1B = await prisma.circuit.create({
            data: {
                customerCircuitId: ckt1B,
                supplierCircuitId: `SUP-1B-${Date.now()}`,
                clientId: client1.id,
                vendorId: vendor.id
            }
        });
        createdCircuitIds.push(circuit1B.id);

        const circuit2A = await prisma.circuit.create({
            data: {
                customerCircuitId: ckt2A,
                supplierCircuitId: `SUP-2A-${Date.now()}`,
                clientId: client2.id,
                vendorId: vendor.id
            }
        });
        createdCircuitIds.push(circuit2A.id);

        console.log('--- TEST 1: Cross-Client Circuit Hijacking Prevention ---');
        // Client 1 sends an email that maliciously or accidentally mentions Client 2's circuit ID!
        const crossEmail = {
            from: client1Email,
            fromName: 'Client 1 Ops',
            subject: `Issue on circuit ${ckt2A}`,
            body: `We are reporting an outage on ${ckt2A}.`,
            messageId: `<test-cross-${Date.now()}@clientone.com>`,
            date: new Date().toISOString()
        };

        const crossTicket = await ticketService.createTicketFromEmail(crossEmail);
        // The system must NOT create a ticket for Client 2!
        assert(crossTicket === null || crossTicket.clientId !== client2.id, 
            'Client 1 was BLOCKED from hijacking Client 2 circuit or raising a ticket under Client 2');
        if (crossTicket) {
            createdTicketIds.push(crossTicket.id);
            assert(crossTicket.clientId !== client2.id, 'Ticket was NOT assigned to Client 2');
        }

        console.log('\n--- TEST 2: Correct Circuit Matching for Client with Multiple Circuits ---');
        // Client 1 sends email for Circuit 1B
        const legitimateEmail1B = {
            from: client1Email,
            fromName: 'Client 1 Ops',
            subject: `Latency on ${ckt1B}`,
            body: `Latency is high on ${ckt1B}.`,
            messageId: `<test-legit-1b-${Date.now()}@clientone.com>`,
            date: new Date().toISOString()
        };

        const ticket1B = await ticketService.createTicketFromEmail(legitimateEmail1B);
        assert(ticket1B !== null, 'Ticket created for Client 1 on Circuit 1B');
        createdTicketIds.push(ticket1B.id);
        assert(ticket1B.clientId === client1.id, `Ticket assigned to Client 1 (${ticket1B.clientId})`);
        assert(ticket1B.circuitId === ckt1B, `Ticket associated with correct circuit ${ckt1B}`);

        // Client 1 sends email for Circuit 1A
        const legitimateEmail1A = {
            from: client1Email,
            fromName: 'Client 1 Ops',
            subject: `Complete down on ${ckt1A}`,
            body: `Circuit ${ckt1A} is hard down.`,
            messageId: `<test-legit-1a-${Date.now()}@clientone.com>`,
            date: new Date().toISOString()
        };

        const ticket1A = await ticketService.createTicketFromEmail(legitimateEmail1A);
        assert(ticket1A !== null, 'Ticket created for Client 1 on Circuit 1A');
        createdTicketIds.push(ticket1A.id);
        assert(ticket1A.clientId === client1.id, `Ticket assigned to Client 1`);
        assert(ticket1A.circuitId === ckt1A, `Ticket associated with correct circuit ${ckt1A}`);
        assert(ticket1A.id !== ticket1B.id, 'Circuits 1A and 1B have separate, distinct tickets');

        console.log('\n--- TEST 3: Subject Fallback Thread Hijacking Prevention ---');
        // Client 1's ticket1A has header: "Complete down on <ckt1A>"
        // Client 2 sends an email with subject: "Re: Complete down on <ckt1A>" mentioning their circuit ckt2A
        const hijackReplyEmail = {
            from: client2Email,
            fromName: 'Client 2 Ops',
            subject: `Re: Complete down on ${ckt1A}`,
            body: `We are also seeing this on ${ckt2A}.`,
            messageId: `<test-hijack-${Date.now()}@clienttwo.com>`,
            date: new Date().toISOString()
        };

        // findExistingTicketForReply should REJECT attaching to ticket1A because sender is Client 2 and circuit is ckt2A!
        const matchedTicket = await ticketService.findExistingTicketForReply(
            null, 
            null, 
            hijackReplyEmail.subject, 
            hijackReplyEmail.body, 
            client2Email
        );
        assert(matchedTicket === null, 'Subject fallback did NOT match Client 1 ticket when replied by Client 2');

        console.log('\n--- TEST 4: Auto-Registration Isolation Protection ---');
        // Reply to ticket1A with a vendor email and client2 email in CC
        const replyWithCcs = {
            from: client1Email,
            fromName: 'Client 1 Manager',
            subject: `Re: [${ticket1A.ticketId}] Complete down on ${ckt1A}`,
            body: 'Adding vendor and partner to the loop.',
            to: ['support@edgestone.in'],
            cc: [vendorEmail, client2Email, 'new_staff@clientone.com'],
            messageId: `<test-reply-cc-${Date.now()}@clientone.com>`,
            inReplyTo: ticket1A.messageId,
            date: new Date().toISOString()
        };

        await ticketService.createTicketFromEmail(replyWithCcs);

        // Fetch client1 from DB
        const reloadedClient1 = await prisma.client.findUnique({ where: { id: client1.id } });
        const c1Emails = reloadedClient1.emails.map(e => e.toLowerCase());

        assert(!c1Emails.includes(vendorEmail.toLowerCase()), 'Vendor email was NOT added to client.emails');
        assert(!c1Emails.includes(client2Email.toLowerCase()), 'Client 2 email was NOT added to client 1.emails');
        assert(c1Emails.includes('new_staff@clientone.com'), 'Legitimate client staff contact was auto-registered');

        console.log('\n--- TEST 5: Quoted History Circuit Bleed Prevention ---');
        // Email subject specifies ckt1A, but quoted old email body mentions ckt1B
        const quotedHistoryEmail = {
            from: client1Email,
            fromName: 'Client 1 NOC',
            subject: `Urgent link issue on ${ckt1A}`,
            body: `Please investigate immediately.\n\nOn Mon, Sep 7, 2026, NOC wrote:\n> Status update on ${ckt1B}: all clear.`,
            messageId: `<test-quoted-${Date.now()}@clientone.com>`,
            date: new Date().toISOString()
        };

        const quotedTicket = await ticketService.createTicketFromEmail(quotedHistoryEmail);
        assert(quotedTicket !== null, 'Ticket created for quoted history email');
        createdTicketIds.push(quotedTicket.id);
        assert(quotedTicket.circuitId === ckt1A, `Correctly matched fresh subject circuit ${ckt1A}, ignoring quoted circuit ${ckt1B}`);

        console.log('\n--- TEST 6: Inherit Client on Manual Circuit Assignment ---');
        // Create an unassigned ticket with no circuit or client
        const manualTicket = await prisma.ticket.create({
            data: {
                ticketId: `#TEST-${Date.now().toString().slice(-4)}`,
                header: 'Unassigned incoming ticket',
                email: 'unregistered@clientone.com',
                status: 'Open',
                priority: 'Low',
                date: '08 Sep 2026'
            }
        });
        createdTicketIds.push(manualTicket.id);
        assert(manualTicket.clientId === null, 'Ticket initially has null clientId');

        // Update ticket with circuit1A
        const updated = await ticketService.updateTicket(manualTicket.id, { circuitId: ckt1A }, 'Test Agent');
        assert(updated.circuitId === ckt1A, 'Circuit assigned to ticket');
        assert(updated.clientId === client1.id, `Ticket automatically inherited client ${client1.name} from circuit`);

        console.log('\n================================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
        console.log('================================================================');

    } catch (err) {
        console.error('Test suite failed:', err);
        throw err;
    } finally {
        // Cleanup test records
        console.log('\nCleaning up test records...');
        if (createdTicketIds.length > 0) {
            await prisma.reply.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
            await prisma.activityLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
            await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
        }
        if (createdCircuitIds.length > 0) {
            await prisma.circuit.deleteMany({ where: { id: { in: createdCircuitIds } } });
        }
        if (createdClientIds.length > 0) {
            await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
        }
        if (createdVendorIds.length > 0) {
            await prisma.vendor.deleteMany({ where: { id: { in: createdVendorIds } } });
        }
        await prisma.$disconnect();
    }
}

runTests().catch(() => process.exit(1));
