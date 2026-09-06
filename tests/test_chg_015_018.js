'use strict';

require('dotenv').config();
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const vendorTicketingService = require('../services/vendorTicketingService');
const emailService = require('../services/emailService');

async function runTests() {
    console.log('====================================================');
    console.log('🧪 RUNNING VERIFICATION SUITE FOR CHG-015 TO CHG-018');
    console.log('====================================================\n');

    // STRICT CONSTRAINT: Use only the email in .env
    const envEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER || 'marketing@edgestone.in';
    console.log(`📧 Test Email configured from .env: ${envEmail}\n`);

    // Mock outgoing email functions so tests NEVER dispatch real emails or fail on external SMTP
    const origSendAgentReply = emailService.sendAgentReplyEmail;
    const origSendAutoReply = emailService.sendAutoReplyEmail;
    const origSendGraph = emailService.sendEmailViaGraph;

    let lastSentEmail = null;
    emailService.sendAgentReplyEmail = async (opts) => {
        lastSentEmail = opts;
        return { messageId: `<test-outbound-${Date.now()}@edgestone.in>` };
    };
    emailService.sendAutoReplyEmail = async (opts) => {
        return { messageId: `<test-autoreply-${Date.now()}@edgestone.in>` };
    };
    emailService.sendEmailViaGraph = async (opts) => {
        lastSentEmail = opts;
        return { messageId: `<test-graph-${Date.now()}@edgestone.in>` };
    };

    let passedTests = 0;
    let totalTests = 0;

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
    let testClientId = null;
    let testVendorId = null;
    const createdCircuitIds = [];

    try {
        // Find or create test client using envEmail
        let testClient = await prisma.client.findFirst({ where: { name: 'AutoTest Env Client' } });
        if (!testClient) {
            testClient = await prisma.client.create({
                data: {
                    name: 'AutoTest Env Client',
                    emails: [envEmail],
                    status: 'Active',
                    createdOn: '06 Sep 2026'
                }
            });
        }
        testClientId = testClient.id;

        // Find or create test vendor using envEmail
        let testVendor = await prisma.vendor.findFirst({ where: { name: 'AutoTest Env Vendor' } });
        if (!testVendor) {
            testVendor = await prisma.vendor.create({
                data: {
                    name: 'AutoTest Env Vendor',
                    emails: [envEmail],
                    status: 'Active',
                    createdOn: '06 Sep 2026'
                }
            });
        }
        testVendorId = testVendor.id;

        // Find or create two circuits for this client (CHG-016)
        let circuitA = await prisma.circuit.findFirst({ where: { customerCircuitId: 'AUTOTEST-CKT-ALPHA-01' } });
        if (!circuitA) {
            circuitA = await prisma.circuit.create({
                data: {
                    customerCircuitId: 'AUTOTEST-CKT-ALPHA-01',
                    supplierCircuitId: 'SUP-AUTOTEST-01',
                    client: { connect: { id: testClient.id } },
                    vendor: { connect: { id: testVendor.id } }
                }
            });
        }
        createdCircuitIds.push(circuitA.id);

        let circuitB = await prisma.circuit.findFirst({ where: { customerCircuitId: 'AUTOTEST-CKT-BETA-02' } });
        if (!circuitB) {
            circuitB = await prisma.circuit.create({
                data: {
                    customerCircuitId: 'AUTOTEST-CKT-BETA-02',
                    supplierCircuitId: 'SUP-AUTOTEST-02',
                    client: { connect: { id: testClient.id } },
                    vendor: { connect: { id: testVendor.id } }
                }
            });
        }
        createdCircuitIds.push(circuitB.id);

        // ─────────────────────────────────────────────────────────────
        // TEST 1: CHG-016 (Same Client with Multiple Circuit IDs)
        // ─────────────────────────────────────────────────────────────
        console.log('--- 1. Testing CHG-016: Multiple Circuits Identification ---');
        
        // Ingest email specifying Circuit B
        const emailForCircuitB = {
            from: envEmail,
            fromName: 'Env Test NOC',
            subject: 'High Packet Loss on AUTOTEST-CKT-BETA-02',
            body: 'Degradation on circuit AUTOTEST-CKT-BETA-02.',
            messageId: `<test-msg-ckt-b-${Date.now()}@edgestone.in>`,
            date: new Date().toISOString()
        };

        const ticketCircuitB = await ticketService.createTicketFromEmail(emailForCircuitB);
        createdTicketIds.push(ticketCircuitB.id);
        assert(ticketCircuitB !== null, 'Ticket created for Circuit B email');
        assert(ticketCircuitB.circuitId === 'AUTOTEST-CKT-BETA-02', `Ticket correctly associated with Circuit B (${ticketCircuitB.circuitId})`);
        assert(ticketCircuitB.clientId === testClient.id, `Ticket correctly associated with Client ${testClient.name}`);

        // Ingest email specifying Circuit A
        const emailForCircuitA = {
            from: envEmail,
            fromName: 'Env Test NOC',
            subject: 'Complete link down on AUTOTEST-CKT-ALPHA-01',
            body: 'Circuit AUTOTEST-CKT-ALPHA-01 is completely down.',
            messageId: `<test-msg-ckt-a-${Date.now()}@edgestone.in>`,
            date: new Date().toISOString()
        };

        const ticketCircuitA = await ticketService.createTicketFromEmail(emailForCircuitA);
        createdTicketIds.push(ticketCircuitA.id);
        assert(ticketCircuitA !== null, 'Ticket created for Circuit A email');
        assert(ticketCircuitA.circuitId === 'AUTOTEST-CKT-ALPHA-01', `Ticket correctly associated with Circuit A (${ticketCircuitA.circuitId})`);
        assert(ticketCircuitA.id !== ticketCircuitB.id, 'Circuits A and B have separate tickets, never mixed');

        // ─────────────────────────────────────────────────────────────
        // TEST 2: CHG-018 (Vendor Reply to Normal Ticket)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 2. Testing CHG-018: Vendor Reply to Normal Ticket ---');

        assert(ticketCircuitA.ticketType === 'Client', 'ticketCircuitA is a normal Client ticket');

        // Vendor replies to this ticket
        const vendorReplyEmail = {
            from: envEmail,
            fromName: 'Telecom NOC Desk',
            subject: `Re: [${ticketCircuitA.ticketId}-V] Complete link down on AUTOTEST-CKT-ALPHA-01`,
            body: 'Field engineers dispatched to exchange for testing.',
            messageId: `<test-vendor-reply-${Date.now()}@edgestone.in>`,
            inReplyTo: ticketCircuitA.messageId,
            date: new Date().toISOString()
        };

        const vendorReplyResult = await ticketService.createTicketFromEmail(vendorReplyEmail);
        assert(vendorReplyResult !== null, 'Vendor reply successfully processed');
        assert(vendorReplyResult.type === 'vendor', `Reply type is 'vendor' (${vendorReplyResult.type})`);
        assert(vendorReplyResult.category.startsWith('vendor'), `Reply category is vendor thread (${vendorReplyResult.category})`);

        // Test frontend filtering function for this reply
        const frontendActiveTabVendor = 'vendor';
        const isMatchedOnVendorTab = (vendorReplyResult.category === frontendActiveTabVendor || 
                                     vendorReplyResult.category?.startsWith('vendor_') || 
                                     vendorReplyResult.type === 'vendor');
        assert(isMatchedOnVendorTab === true, 'Vendor reply is matched and VISIBLE on the frontend Vendor tab');

        const frontendActiveTabClient = 'client';
        const isExcludedOnClientTab = !(vendorReplyResult.category === 'client' || (!vendorReplyResult.category && vendorReplyResult.type !== 'vendor'));
        assert(isExcludedOnClientTab === true, 'Vendor reply is cleanly separated from the Client conversation tab');

        // ─────────────────────────────────────────────────────────────
        // TEST 3: CHG-015 (Support CC Recipient & Full Email Thread)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 3. Testing CHG-015: Full Thread History & CC Capture ---');

        lastSentEmail = null;
        const newCcRecipient = envEmail;
        await ticketService.replyToTicket(
            ticketCircuitA.id,
            'Field team is investigating.',
            envEmail,
            'Support Agent',
            null,
            [],
            {
                to: [ticketCircuitA.email],
                cc: [newCcRecipient],
                subject: `Re: [${ticketCircuitA.ticketId}] Update on outage`
            }
        );

        assert(lastSentEmail !== null, 'Agent reply email sent');
        assert(lastSentEmail.cc.includes(newCcRecipient), `Outbound email CC includes ${newCcRecipient}`);
        assert(!lastSentEmail.html.includes('--- Previous Conversation ---'), 'Outbound HTML does NOT include "--- Previous Conversation ---" block');
        assert(!lastSentEmail.text.includes('--- Previous Conversation ---'), 'Outbound text does NOT include "--- Previous Conversation ---" block');

        const updatedTicketA = await prisma.ticket.findUnique({ where: { id: ticketCircuitA.id } });
        assert(updatedTicketA.cc.includes(newCcRecipient), `Ticket in DB permanently saved CC recipient ${newCcRecipient}`);

        // Simulate the CC recipient replying to this thread
        const ccReplyEmail = {
            from: newCcRecipient,
            fromName: 'Manager Reply',
            subject: `Re: [${ticketCircuitA.ticketId}] Update on outage`,
            body: 'Thank you for the update. Please let us know the ETA.',
            messageId: `<cc-reply-${Date.now()}@edgestone.in>`,
            inReplyTo: lastSentEmail.messageId,
            date: new Date().toISOString()
        };

        const ccReplyResult = await ticketService.createTicketFromEmail(ccReplyEmail);
        assert(ccReplyResult !== null, 'CC recipient reply successfully processed');
        assert(ccReplyResult.ticketId === ticketCircuitA.id, `CC reply appended to correct ticket (${ticketCircuitA.ticketId})`);
        assert(ccReplyResult.type === 'client', 'CC reply categorized under client thread');

        // ─────────────────────────────────────────────────────────────
        // TEST 4: CHG-017 (CC/BCC Changes from Crew to Vendor Side)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 4. Testing CHG-017: Crew to Vendor CC/BCC Privacy ---');

        lastSentEmail = null;
        const clientSideCc = envEmail; // in client.emails
        const internalCrewCc = 'internal_crew@edgestone.in';

        await vendorTicketingService.replyToVendor(
            ticketCircuitA.id,
            {
                message: 'Please provide fiber OTDR test results.',
                to: [envEmail],
                cc: [clientSideCc, internalCrewCc],
                bcc: ['mgmt@edgestone.in']
            },
            'agent@edgestone.in',
            'Support Agent'
        );

        assert(lastSentEmail !== null, 'Vendor reply email sent');
        assert(!lastSentEmail.cc.includes(clientSideCc), `Client email ${clientSideCc} is STRIPPED from visible Vendor CC`);
        assert(lastSentEmail.cc.includes(internalCrewCc), `Crew email ${internalCrewCc} remains in visible Vendor CC`);
        assert(lastSentEmail.bcc.includes(clientSideCc), `Client email ${clientSideCc} is MOVED to hidden Vendor BCC`);
        assert(!lastSentEmail.html.includes('--- Previous Conversation ---'), 'Vendor outbound email does NOT include "--- Previous Conversation ---" block');

        console.log('\n====================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
        console.log('====================================================\n');

    } catch (err) {
        console.error('❌ Test failed with error:', err);
        throw err;
    } finally {
        // ALWAYS CLEAN UP TEST RECORDS SO DASHBOARD REMAINS 100% CLEAN
        console.log('🧹 Cleaning up test records from database...');
        try {
            if (createdTicketIds.length > 0) {
                await prisma.reply.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
                await prisma.activityLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
                try {
                    await prisma.sLARecord.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
                } catch (e) {}
                try {
                    await prisma.notification.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
                } catch (e) {}
                await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
            }
            if (createdCircuitIds.length > 0) {
                await prisma.circuit.deleteMany({ where: { id: { in: createdCircuitIds } } });
            }
            if (testClientId) {
                await prisma.client.deleteMany({ where: { id: testClientId } });
            }
            if (testVendorId) {
                await prisma.vendor.deleteMany({ where: { id: testVendorId } });
            }
            console.log('✅ Test cleanup complete. Database restored.');
        } catch (cleanErr) {
            console.error('Cleanup warning:', cleanErr.message);
        }

        // Restore original methods
        emailService.sendAgentReplyEmail = origSendAgentReply;
        emailService.sendAutoReplyEmail = origSendAutoReply;
        emailService.sendEmailViaGraph = origSendGraph;

        await prisma.$disconnect();
    }
}

runTests().catch(() => process.exit(1));
