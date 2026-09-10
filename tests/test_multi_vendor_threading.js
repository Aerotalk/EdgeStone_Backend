require('dotenv').config();
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const vendorTicketingService = require('../services/vendorTicketingService');
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
    console.log('🧪 TEST: Multi-Vendor Maintenance Threading & References Chain');
    console.log('========================================================================');

    const timestamp = Date.now();
    const vendorEmail1 = `vendor1_${timestamp}@airteltest.com`;
    const vendorEmail2 = `vendor2_${timestamp}@airteltest.com`;
    const circuitId = `VEND-THREAD-CKT-${timestamp}`;

    let createdVendorId = null;
    let createdCircuitId = null;
    let createdTicketId = null;
    let capturedOutboundEmails = [];

    // Mock emailService.sendAgentReplyEmail to capture outbound email data
    const origSendAgentReplyEmail = emailService.sendAgentReplyEmail;
    emailService.sendAgentReplyEmail = async (emailData) => {
        capturedOutboundEmails.push(emailData);
        return {
            id: `graph-msg-${Date.now()}`,
            internetMessageId: `<test-agent-reply-${Date.now()}-${capturedOutboundEmails.length}@edgestone.in>`
        };
    };

    try {
        // 1. Seed Vendor and Circuit
        const vendor = await prisma.vendor.create({
            data: {
                name: `Multi-Vendor Test ${timestamp}`,
                emails: [vendorEmail1, vendorEmail2],
                status: 'Active',
                createdOn: '10 Sep 2026'
            }
        });
        createdVendorId = vendor.id;

        const circuit = await prisma.circuit.create({
            data: {
                customerCircuitId: circuitId,
                supplierCircuitId: `VEND-SUP-${timestamp}`,
                vendor: { connect: { id: vendor.id } }
            }
        });
        createdCircuitId = circuit.id;

        // 2. Initial Vendor Maintenance Email arrives
        const rootMessageId = `<incoming-root-maint-${timestamp}@airteltest.com>`;
        const initialEmail = {
            from: vendorEmail1,
            to: ['marketing@edgestone.in'],
            cc: [vendorEmail2],
            subject: `Emergency Maintenance on ${circuitId}`,
            text: `Dear Team, We are carrying out emergency maintenance on circuit ${circuitId}.`,
            html: `<p>Dear Team, We are carrying out emergency maintenance on circuit ${circuitId}.</p>`,
            messageId: rootMessageId,
            date: new Date().toISOString()
        };

        console.log('\n--- Step 1: Ingest Initial Multi-Vendor Maintenance Email ---');
        const ticketResult = await ticketService.createTicketFromEmail(initialEmail);
        assert(ticketResult && ticketResult.id, 'Vendor ticket was created');
        createdTicketId = ticketResult.id;
        assert(ticketResult.ticketId.startsWith('#V'), `Ticket has #V prefix: ${ticketResult.ticketId}`);

        // Agent tags ticket as Maintenance
        await prisma.ticket.update({
            where: { id: ticketResult.id },
            data: { isMaintenance: true, status: 'Maintenance' }
        });
        const updatedMaintTicket = await prisma.ticket.findUnique({ where: { id: ticketResult.id } });
        assert(updatedMaintTicket.isMaintenance === true, 'Ticket isMaintenance is true');
        assert(updatedMaintTicket.status === 'Maintenance', 'Ticket status is tagged as Maintenance');

        // 3. Agent replies to both vendors
        console.log('\n--- Step 2: Agent replies to Vendor 1 and Vendor 2 ---');
        capturedOutboundEmails = [];
        await vendorTicketingService.replyToVendor(
            ticketResult.id,
            {
                message: 'Acknowledged. Please provide ETA.',
                to: [vendorEmail1, vendorEmail2],
                subject: ticketResult.header
            },
            'agent@edgestone.in',
            'Support Lead'
        );

        assert(capturedOutboundEmails.length === 1, 'Agent reply email was dispatched');
        const reply1 = capturedOutboundEmails[0];
        assert(reply1.inReplyTo === rootMessageId, `In-Reply-To references root message ID: ${reply1.inReplyTo}`);
        assert(reply1.references.includes(rootMessageId), `References includes root message ID: ${reply1.references}`);
        assert(reply1.to.includes(vendorEmail1) && reply1.to.includes(vendorEmail2), 'Dispatched to both vendor 1 and vendor 2 in TO');

        // 4. Vendor 1 replies back
        console.log('\n--- Step 3: Vendor 1 replies back with ETA ---');
        const vendor1ReplyMessageId = `<reply-vendor1-${timestamp}@airteltest.com>`;
        const vendor1ReplyEmail = {
            from: vendorEmail1,
            to: ['marketing@edgestone.in'],
            cc: [vendorEmail2],
            subject: `Re: [${ticketResult.ticketId}-V] Emergency Maintenance on ${circuitId}`,
            text: 'ETA is 2 hours from now.',
            html: '<p>ETA is 2 hours from now.</p>',
            messageId: vendor1ReplyMessageId,
            inReplyTo: reply1.messageId || rootMessageId,
            references: `${rootMessageId} ${reply1.messageId || ''}`.trim(),
            date: new Date().toISOString()
        };

        const v1Result = await ticketService.createTicketFromEmail(vendor1ReplyEmail);
        assert(v1Result && v1Result.ticketId === ticketResult.id, 'Vendor 1 reply matched existing ticket');
        assert(v1Result.type === 'vendor', 'Vendor 1 reply categorized as vendor thread');

        // 5. Agent replies again
        console.log('\n--- Step 4: Agent replies acknowledging ETA ---');
        capturedOutboundEmails = [];
        await vendorTicketingService.replyToVendor(
            ticketResult.id,
            {
                message: 'Thank you for the ETA. Monitoring.',
                to: [vendorEmail1, vendorEmail2],
                subject: ticketResult.header
            },
            'agent@edgestone.in',
            'Support Lead'
        );

        assert(capturedOutboundEmails.length === 1, 'Second agent reply was dispatched');
        const reply2 = capturedOutboundEmails[0];
        console.log(`    References in reply 2: ${reply2.references}`);
        assert(reply2.references.includes(rootMessageId), 'References contains root message ID');
        assert(reply2.references.includes(vendor1ReplyMessageId), 'References contains Vendor 1 reply message ID');
        // Ensure references order is chronological and chained
        const rootIdx = reply2.references.indexOf(rootMessageId);
        const v1Idx = reply2.references.indexOf(vendor1ReplyMessageId);
        assert(rootIdx < v1Idx, 'References chain preserves chronological order (root < vendor 1 reply)');

        // 6. Vendor 2 replies (the other vendor email in the multiple email group)
        console.log('\n--- Step 5: Vendor 2 replies with completion confirmation ---');
        const vendor2ReplyMessageId = `<reply-vendor2-${timestamp}@airteltest.com>`;
        const vendor2ReplyEmail = {
            from: vendorEmail2,
            to: ['marketing@edgestone.in'],
            cc: [vendorEmail1],
            subject: `Re: [${ticketResult.ticketId}-V] Emergency Maintenance on ${circuitId}`,
            text: 'Maintenance activity completed successfully ahead of schedule.',
            html: '<p>Maintenance activity completed successfully ahead of schedule.</p>',
            messageId: vendor2ReplyMessageId,
            inReplyTo: reply2.messageId || vendor1ReplyMessageId,
            references: `${reply2.references} ${reply2.messageId || ''}`.trim(),
            date: new Date().toISOString()
        };

        const v2Result = await ticketService.createTicketFromEmail(vendor2ReplyEmail);
        assert(v2Result && v2Result.ticketId === ticketResult.id, 'Vendor 2 reply matched existing ticket thread');
        assert(v2Result.type === 'vendor', 'Vendor 2 reply categorized as vendor thread');

        // 7. Agent final confirmation reply
        console.log('\n--- Step 6: Agent final reply to all vendors ---');
        capturedOutboundEmails = [];
        await vendorTicketingService.replyToVendor(
            ticketResult.id,
            {
                message: 'All links confirmed green. Closing maintenance ticket.',
                to: [vendorEmail1, vendorEmail2],
                subject: ticketResult.header
            },
            'agent@edgestone.in',
            'Support Lead'
        );

        assert(capturedOutboundEmails.length === 1, 'Final agent reply dispatched');
        const reply3 = capturedOutboundEmails[0];
        console.log(`    References in final reply: ${reply3.references}`);
        assert(reply3.references.includes(rootMessageId), 'Final references contains root ID');
        assert(reply3.references.includes(vendor1ReplyMessageId), 'Final references contains Vendor 1 reply ID');
        assert(reply3.references.includes(vendor2ReplyMessageId), 'Final references contains Vendor 2 reply ID');

        console.log('\n========================================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} MULTI-VENDOR THREADING TESTS PASSED!`);
        console.log('========================================================================\n');

    } catch (err) {
        console.error('❌ Multi-vendor threading test failed:', err);
        throw err;
    } finally {
        emailService.sendAgentReplyEmail = origSendAgentReplyEmail;
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
        if (createdVendorId) {
            await prisma.vendor.delete({ where: { id: createdVendorId } }).catch(() => {});
        }
        console.log('✅ Cleanup complete.');
    }
}

runTest().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
