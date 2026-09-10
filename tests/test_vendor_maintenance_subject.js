'use strict';

require('dotenv').config();
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const vendorTicketingService = require('../services/vendorTicketingService');
const emailService = require('../services/emailService');

async function runTests() {
    console.log('====================================================');
    console.log('🧪 RUNNING VENDOR MAINTENANCE SUBJECT VERIFICATION');
    console.log('====================================================\n');

    const envEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER || 'marketing@edgestone.in';

    // Mock outgoing email functions
    let lastSentEmail = null;
    const origSendAgentReply = emailService.sendAgentReplyEmail;
    const origSendAutoReply = emailService.sendAutoReplyEmail;
    const origSendGraph = emailService.sendEmailViaGraph;

    emailService.sendAgentReplyEmail = async (opts) => {
        lastSentEmail = opts;
        return { messageId: `<test-outbound-vendor-${Date.now()}@edgestone.in>` };
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
    let testVendorId = null;
    let testCircuitId = null;

    try {
        // 1. Create or fetch test vendor
        let testVendor = await prisma.vendor.findFirst({ where: { name: 'Test Maintenance Vendor' } });
        if (!testVendor) {
            testVendor = await prisma.vendor.create({
                data: {
                    name: 'Test Maintenance Vendor',
                    emails: [envEmail, 'priyanshu_vendor_test@aerovendor.com'],
                    status: 'Active',
                    createdOn: '10 Sep 2026'
                }
            });
        }
        testVendorId = testVendor.id;

        // 2. Create test circuit with supplier circuit ID
        const ts = Date.now();
        const testCircuit = await prisma.circuit.create({
            data: {
                customerCircuitId: `TEST-MAINT-CKT-${ts}`,
                supplierCircuitId: `TEST-SUP-${ts}`,
                vendor: { connect: { id: testVendor.id } }
            }
        });
        testCircuitId = testCircuit.id;

        // ─────────────────────────────────────────────────────────────
        // TEST 1: Vendor creates a Maintenance Ticket from Email
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 1. Testing Vendor Maintenance Email Processing ---');

        const incomingMessageId = `<incoming-maint-${Date.now()}@aerovendor.com>`;
        const vendorMaintEmail = {
            from: envEmail, // recognized vendor email
            fromName: 'Priyanshu Routh',
            subject: 'Planning a Scheduled Maintainence',
            body: `Planning a Scheduled Maintainence on ticket of CKT ID:- ${testCircuit.customerCircuitId}\nPls look forward\nRegards,\nPriyanshu Routh`,
            messageId: incomingMessageId,
            date: new Date().toISOString()
        };

        const maintTicket = await ticketService.createTicketFromEmail(vendorMaintEmail);
        assert(maintTicket !== null, 'Maintenance ticket was created successfully');
        createdTicketIds.push(maintTicket.id);

        assert(maintTicket.header === 'Planning a Scheduled Maintainence', `Ticket header matches vendor-provided subject (${maintTicket.header})`);
        assert(maintTicket.ticketType === 'Vendor', `Ticket type is 'Vendor' (${maintTicket.ticketType})`);
        assert(maintTicket.ticketId.startsWith('#V'), `Ticket ID has vendor prefix (${maintTicket.ticketId})`);

        // Check initial reply has subject and messageId
        const initialReplies = await prisma.reply.findMany({
            where: { ticketId: maintTicket.id },
            orderBy: { createdAt: 'asc' }
        });
        assert(initialReplies.length > 0, 'Initial reply was saved');
        assert(initialReplies[0].subject === 'Planning a Scheduled Maintainence', `Initial reply recorded subject: ${initialReplies[0].subject}`);
        assert(initialReplies[0].messageId === incomingMessageId, `Initial reply recorded messageId: ${initialReplies[0].messageId}`);

        // ─────────────────────────────────────────────────────────────
        // TEST 2: Replying to Vendor preserves the Vendor-Provided Subject
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 2. Testing Vendor Reply with Vendor-Provided Subject ---');

        lastSentEmail = null;
        const replySubject = `Re: [${maintTicket.ticketId}-V] Planning a Scheduled Maintainence`;
        await vendorTicketingService.replyToVendor(
            maintTicket.id,
            {
                message: 'Please Notify Once the Maintainence Window ends',
                to: [envEmail],
                subject: replySubject
            },
            envEmail,
            'Super Admin'
        );

        assert(lastSentEmail !== null, 'Outbound email was sent via emailService');
        assert(lastSentEmail.subject === replySubject, `Outbound subject is '${lastSentEmail.subject}', NOT 'Issue regarding Circuit'`);
        assert(lastSentEmail.subject.includes('Planning a Scheduled Maintainence'), 'Outbound subject preserves the vendor-provided maintenance subject');
        assert(!lastSentEmail.subject.includes('Issue regarding Circuit'), 'Outbound subject does not contain unwanted generic circuit text');
        assert(lastSentEmail.inReplyTo === incomingMessageId, `In-Reply-To correctly references original vendor email Message-ID (${lastSentEmail.inReplyTo})`);
        assert(lastSentEmail.references === incomingMessageId, `References correctly references original vendor email Message-ID (${lastSentEmail.references})`);

        // ─────────────────────────────────────────────────────────────
        // TEST 3: Fallback vendor subject uses ticket.header for Maintenance
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 3. Testing Fallback Vendor Subject on Maintenance Ticket ---');

        lastSentEmail = null;
        // Call without passing subject
        await vendorTicketingService.replyToVendor(
            maintTicket.id,
            {
                message: 'Second follow up to vendor',
                to: [envEmail]
                // no subject passed
            },
            envEmail,
            'Super Admin'
        );

        assert(lastSentEmail !== null, 'Fallback outbound email was sent');
        assert(lastSentEmail.subject === `Re: [${maintTicket.ticketId}-V] Planning a Scheduled Maintainence`, 
            `Fallback subject properly used vendor header: ${lastSentEmail.subject}`);

        console.log('\n====================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
        console.log('====================================================\n');

    } catch (err) {
        console.error('❌ Test failed with error:', err);
        throw err;
    } finally {
        // Restore original functions
        emailService.sendAgentReplyEmail = origSendAgentReply;
        emailService.sendAutoReplyEmail = origSendAutoReply;
        emailService.sendEmailViaGraph = origSendGraph;

        // Cleanup
        console.log('🧹 Cleaning up test database records...');
        if (createdTicketIds.length > 0) {
            await prisma.reply.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
            await prisma.activityLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
            await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
        }
        if (testCircuitId) {
            await prisma.circuit.delete({ where: { id: testCircuitId } }).catch(() => {});
        }
        if (testVendorId) {
            await prisma.vendor.delete({ where: { id: testVendorId } }).catch(() => {});
        }
        console.log('✅ Cleanup finished.');
    }
}

runTests().catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
});
