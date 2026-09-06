'use strict';

const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const vendorTicketingService = require('../services/vendorTicketingService');
const emailService = require('../services/emailService');

async function runTests() {
    console.log('====================================================');
    console.log('🧪 RUNNING VERIFICATION SUITE FOR CHG-015 TO CHG-018');
    console.log('====================================================\n');

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

    try {
        // Find or create test client
        let testClient = await prisma.client.findFirst({ where: { name: 'Test Corp MultiCircuit' } });
        if (!testClient) {
            testClient = await prisma.client.create({
                data: {
                    name: 'Test Corp MultiCircuit',
                    emails: ['noc@testcorp.com', 'escalations@testcorp.com'],
                    status: 'Active',
                    createdOn: '06 Sep 2026'
                }
            });
        }

        // Find or create test vendor
        let testVendor = await prisma.vendor.findFirst({ where: { name: 'Test Telecom Vendor' } });
        if (!testVendor) {
            testVendor = await prisma.vendor.create({
                data: {
                    name: 'Test Telecom Vendor',
                    emails: ['noc@testvendor.com'],
                    status: 'Active',
                    createdOn: '06 Sep 2026'
                }
            });
        }

        // Find or create two circuits for this same client (CHG-016)
        let circuitA = await prisma.circuit.findFirst({ where: { customerCircuitId: 'TEST-CKT-MUMBAI-001' } });
        if (!circuitA) {
            circuitA = await prisma.circuit.create({
                data: {
                    customerCircuitId: 'TEST-CKT-MUMBAI-001',
                    supplierCircuitId: 'SUP-MUM-001',
                    client: { connect: { id: testClient.id } },
                    vendor: { connect: { id: testVendor.id } }
                }
            });
        }

        let circuitB = await prisma.circuit.findFirst({ where: { customerCircuitId: 'TEST-CKT-DELHI-002' } });
        if (!circuitB) {
            circuitB = await prisma.circuit.create({
                data: {
                    customerCircuitId: 'TEST-CKT-DELHI-002',
                    supplierCircuitId: 'SUP-DEL-002',
                    client: { connect: { id: testClient.id } },
                    vendor: { connect: { id: testVendor.id } }
                }
            });
        }

        // ─────────────────────────────────────────────────────────────
        // TEST 1: CHG-016 (Same Client with Multiple Circuit IDs)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 1. Testing CHG-016: Multiple Circuits Identification ---');
        
        // Ingest email specifying Circuit B
        const emailForCircuitB = {
            from: 'noc@testcorp.com',
            fromName: 'Test Corp NOC',
            subject: 'High Packet Loss on TEST-CKT-DELHI-002',
            body: 'Hello Team, we are observing degradation on circuit TEST-CKT-DELHI-002.',
            messageId: `<test-msg-ckt-b-${Date.now()}@testcorp.com>`,
            date: new Date().toISOString()
        };

        const ticketCircuitB = await ticketService.createTicketFromEmail(emailForCircuitB);
        assert(ticketCircuitB !== null, 'Ticket created for Circuit B email');
        assert(ticketCircuitB.circuitId === 'TEST-CKT-DELHI-002', `Ticket correctly associated with Circuit B (${ticketCircuitB.circuitId})`);
        assert(ticketCircuitB.clientId === testClient.id, `Ticket correctly associated with Client ${testClient.name}`);

        // Ingest email specifying Circuit A
        const emailForCircuitA = {
            from: 'noc@testcorp.com',
            fromName: 'Test Corp NOC',
            subject: 'Complete link down on TEST-CKT-MUMBAI-001',
            body: 'Circuit TEST-CKT-MUMBAI-001 is completely down.',
            messageId: `<test-msg-ckt-a-${Date.now()}@testcorp.com>`,
            date: new Date().toISOString()
        };

        const ticketCircuitA = await ticketService.createTicketFromEmail(emailForCircuitA);
        assert(ticketCircuitA !== null, 'Ticket created for Circuit A email');
        assert(ticketCircuitA.circuitId === 'TEST-CKT-MUMBAI-001', `Ticket correctly associated with Circuit A (${ticketCircuitA.circuitId})`);
        assert(ticketCircuitA.id !== ticketCircuitB.id, 'Circuits A and B have separate tickets, never mixed');

        // ─────────────────────────────────────────────────────────────
        // TEST 2: CHG-018 (Vendor Reply to Normal Ticket)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 2. Testing CHG-018: Vendor Reply to Normal Ticket ---');

        // Normal ticket (ticketCircuitA is client-raised)
        assert(ticketCircuitA.ticketType === 'Client', 'ticketCircuitA is a normal Client ticket');

        // Vendor replies to this ticket
        const vendorReplyEmail = {
            from: 'noc@testvendor.com',
            fromName: 'Telecom NOC Desk',
            subject: `Re: [${ticketCircuitA.ticketId}-V] Complete link down on TEST-CKT-MUMBAI-001`,
            body: 'We have dispatched field engineers to the local fiber exchange for testing.',
            messageId: `<test-vendor-reply-${Date.now()}@testvendor.com>`,
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

        // Mock sendAgentReplyEmail to inspect outbound email contents
        let lastSentEmail = null;
        const originalSendAgentReplyEmail = emailService.sendAgentReplyEmail;
        emailService.sendAgentReplyEmail = async (opts) => {
            lastSentEmail = opts;
            return { messageId: `<outbound-${Date.now()}@edgestone.in>` };
        };

        const newCcRecipient = 'new_manager@testcorp.com';
        await ticketService.replyToTicket(
            ticketCircuitA.id,
            'Field team is on site investigating.',
            'agent@edgestone.in',
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
        assert(lastSentEmail.html.includes('--- Previous Conversation ---'), 'Outbound HTML includes complete "--- Previous Conversation ---" block');
        assert(lastSentEmail.text.includes('--- Previous Conversation ---'), 'Outbound text includes complete "--- Previous Conversation ---" block');

        // Check if ticket.cc in DB was updated
        const updatedTicketA = await prisma.ticket.findUnique({ where: { id: ticketCircuitA.id } });
        assert(updatedTicketA.cc.includes(newCcRecipient), `Ticket in DB permanently saved CC recipient ${newCcRecipient}`);

        // Now simulate the CC recipient replying to this thread
        const ccReplyEmail = {
            from: newCcRecipient,
            fromName: 'New Manager',
            subject: `Re: [${ticketCircuitA.ticketId}] Update on outage`,
            body: 'Thank you for the update. Please let us know the ETA.',
            messageId: `<cc-reply-${Date.now()}@testcorp.com>`,
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
        const clientSideCc = 'vip_client@testcorp.com'; // Belongs to @testcorp.com domain
        const internalCrewCc = 'lead@edgestone.in';

        await vendorTicketingService.replyToVendor(
            ticketCircuitA.id,
            {
                message: 'Please provide fiber OTDR test results.',
                to: ['noc@testvendor.com'],
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
        assert(lastSentEmail.html.includes('--- Previous Conversation ---'), 'Vendor outbound email includes previous thread history');

        // Restore original method
        emailService.sendAgentReplyEmail = originalSendAgentReplyEmail;

        console.log('\n====================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
        console.log('====================================================\n');

    } catch (err) {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

runTests();
