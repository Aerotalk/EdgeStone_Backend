'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const emailService = require('../services/emailService');

async function runTests() {
    console.log('========================================================================');
    console.log('🧪 TESTING UNKNOWN SENDER CIRCUIT PROTECTION & PROFILE ISOLATION');
    console.log('========================================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`  ✅ PASS: ${message}`);
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    const testTimestamp = Date.now();
    const customerCircuitId = `ACME-CKT-${testTimestamp}`;
    const supplierCircuitId = `COG-SUP-${testTimestamp}`;
    const clientRegisteredEmail = `ops_${testTimestamp}@acmeretail.com`;
    const clientColleagueEmail = `alex.engineer_${testTimestamp}@acmeretail.com`;
    const unknownStrangerEmail = `random_stranger_${testTimestamp}@gmail.com`;
    const externalReplyCcEmail = `unrelated_thirdparty_${testTimestamp}@yahoo.com`;

    let client = null;
    let vendor = null;
    let circuit = null;
    const createdTicketIds = [];

    // Mock sendEmail to track auto-replies
    let sentEmails = [];
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = async (opts) => {
        sentEmails.push(opts);
        return { messageId: `mock-msg-${Date.now()}` };
    };

    try {
        // Setup Client
        client = await prisma.client.create({
            data: {
                name: `Acme Retail ${testTimestamp}`,
                emails: [clientRegisteredEmail],
                status: 'Active',
                createdOn: new Date().toISOString()
            }
        });
        console.log(`👤 Created Client: ${client.name} with email: ${clientRegisteredEmail}`);

        // Setup Vendor
        vendor = await prisma.vendor.create({
            data: {
                name: `Cognizant ${testTimestamp}`,
                emails: [`noc_${testTimestamp}@cognizant.com`],
                status: 'Active',
                createdOn: new Date().toISOString()
            }
        });
        console.log(`🏢 Created Vendor: ${vendor.name}`);

        // Setup Circuit
        circuit = await prisma.circuit.create({
            data: {
                customerCircuitId: customerCircuitId,
                supplierCircuitId: supplierCircuitId,
                client: { connect: { id: client.id } },
                vendor: { connect: { id: vendor.id } },
                type: 'PROTECTED',
                mrc: 1000,
                supplierMrc: 800
            }
        });
        console.log(`🔗 Created Circuit: ${customerCircuitId} owned by Client ${client.id}\n`);

        // ─────────────────────────────────────────────────────────────────────
        // TEST 1: Unknown Sender with Valid Customer Circuit ID
        // ─────────────────────────────────────────────────────────────────────
        console.log('--- TEST 1: Unknown Sender (random_stranger@gmail.com) with Valid Circuit ID ---');
        sentEmails = [];

        const t1 = await ticketService.createTicketFromEmail({
            from: unknownStrangerEmail,
            fromName: 'Random Stranger',
            subject: `Issue on Circuit ${customerCircuitId}`,
            body: `Hello, we noticed packet loss on ${customerCircuitId}. Please look into this.`,
            date: new Date().toISOString()
        });

        if (t1) createdTicketIds.push(t1.id);

        assert(t1 !== null, 'Ticket was created for unverified sender');
        assert(t1.circuitId === customerCircuitId, `Ticket circuitId links to ${customerCircuitId}`);
        assert(t1.clientId === null, `Ticket clientId is strictly NULL (actual: ${t1.clientId})`);
        assert(t1.header.includes('[UNVERIFIED SENDER]'), `Ticket header contains [UNVERIFIED SENDER] (actual: ${t1.header})`);
        assert(sentEmails.length === 0, `Auto-reply was SUPPRESSED for unverified sender (count: ${sentEmails.length})`);

        // Verify Client profile in database
        const clientAfterT1 = await prisma.client.findUnique({ where: { id: client.id } });
        assert(!clientAfterT1.emails.includes(unknownStrangerEmail), `Unknown sender ${unknownStrangerEmail} was NOT added to Client.emails! Client profile protected!`);
        assert(clientAfterT1.emails.length === 1, `Client.emails count remains exactly 1 (actual: ${clientAfterT1.emails.length})`);

        // ─────────────────────────────────────────────────────────────────────
        // TEST 2: Corporate Colleague (Unregistered email, but @acmeretail.com domain matches Client)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- TEST 2: Unregistered Colleague (@acmeretail.com) with Valid Circuit ID ---');
        sentEmails = [];

        const t2 = await ticketService.createTicketFromEmail({
            from: clientColleagueEmail,
            fromName: 'Alex Engineer',
            subject: `Bandwidth alert on ${customerCircuitId}`,
            body: `Hi Team, our store is reporting high utilization on circuit ${customerCircuitId}.`,
            date: new Date().toISOString()
        });

        if (t2) createdTicketIds.push(t2.id);

        assert(t2 !== null, 'Ticket was created for domain-matched colleague');
        assert(t2.clientId === client.id, `Ticket clientId matches Acme Retail (actual: ${t2.clientId})`);
        assert(t2.ticketType === 'Client', `Ticket type is 'Client' (actual: ${t2.ticketType})`);
        assert(!t2.header.includes('[UNVERIFIED SENDER]'), `Ticket header does not have [UNVERIFIED SENDER]`);
        assert(sentEmails.length === 1, `Auto-reply WAS dispatched to verified colleague (count: ${sentEmails.length})`);

        // Verify Client profile in database: colleague SHOULD be auto-registered
        const clientAfterT2 = await prisma.client.findUnique({ where: { id: client.id } });
        assert(clientAfterT2.emails.includes(clientColleagueEmail), `Verified colleague ${clientColleagueEmail} was auto-registered into Client.emails`);
        assert(clientAfterT2.emails.length === 2, `Client.emails count is now 2`);

        // ─────────────────────────────────────────────────────────────────────
        // TEST 3: Existing Registered Client (Regression Test)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- TEST 3: Existing Registered Client (ops@acmeretail.com) ---');
        sentEmails = [];

        const t3 = await ticketService.createTicketFromEmail({
            from: clientRegisteredEmail,
            fromName: 'Acme Operations',
            subject: `Scheduled reboot on ${customerCircuitId}`,
            body: `We are rebooting our local router on ${customerCircuitId}.`,
            date: new Date().toISOString()
        });

        if (t3) createdTicketIds.push(t3.id);

        assert(t3 !== null, 'Ticket was created for registered client');
        assert(t3.clientId === client.id, `Ticket clientId matches Acme Retail`);
        assert(t3.ticketType === 'Client', `Ticket type is 'Client'`);
        assert(sentEmails.length === 1, `Auto-reply was sent to registered client`);

        // ─────────────────────────────────────────────────────────────────────
        // TEST 4: External Third-Party on CC during Reply Thread
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- TEST 4: External Third-Party in CC during Ticket Reply ---');

        await ticketService.createTicketFromEmail({
            from: clientRegisteredEmail,
            fromName: 'Acme Operations',
            subject: `Re: [${t3.ticketId}] Scheduled reboot on ${customerCircuitId}`,
            body: `Adding external technician to this thread.`,
            cc: [externalReplyCcEmail],
            inReplyTo: t3.messageId,
            date: new Date().toISOString()
        });

        // Verify that the external CC email was NOT pushed into Client.emails
        const clientAfterReply = await prisma.client.findUnique({ where: { id: client.id } });
        assert(!clientAfterReply.emails.includes(externalReplyCcEmail), `External CC ${externalReplyCcEmail} was strictly BLOCKED from Client.emails!`);
        assert(clientAfterReply.emails.length === 2, `Client.emails remains clean with only verified contacts (count: ${clientAfterReply.emails.length})`);

        console.log('\n========================================================================');
        console.log(`🎉 ALL TESTS PASSED: ${passedTests} / ${totalTests} checks passed successfully!`);
        console.log('========================================================================\n');

    } finally {
        // Restore mocked sendEmail
        emailService.sendEmail = originalSendEmail;

        // Cleanup test data
        console.log('🧹 Cleaning up test artifacts from database...');
        try {
            for (const tid of createdTicketIds) {
                await prisma.reply.deleteMany({ where: { ticketId: tid } }).catch(() => {});
                await prisma.activityLog.deleteMany({ where: { ticketId: tid } }).catch(() => {});
                await prisma.ticket.delete({ where: { id: tid } }).catch(() => {});
            }
            if (circuit) await prisma.circuit.delete({ where: { id: circuit.id } }).catch(() => {});
            if (client) await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
            if (vendor) await prisma.vendor.delete({ where: { id: vendor.id } }).catch(() => {});
            console.log('✨ Cleanup complete.');
        } catch (cleanupErr) {
            console.error('Cleanup warning:', cleanupErr.message);
        }
        await prisma.$disconnect();
    }
}

runTests().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
