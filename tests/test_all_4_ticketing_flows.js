'use strict';

require('dotenv').config();
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const vendorTicketingService = require('../services/vendorTicketingService');
const emailService = require('../services/emailService');

async function runTests() {
    console.log('========================================================================');
    console.log('🧪 VERIFYING ALL 4 TICKETING FLOWS (END-TO-END VALIDATION)');
    console.log('========================================================================\n');

    const envEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER || 'marketing@edgestone.in';
    console.log(`📧 Test Email configured: ${envEmail}\n`);

    // Track mock email dispatches
    let lastAutoReply = null;
    let autoReplyCount = 0;
    let lastAgentReply = null;
    let agentReplyCount = 0;

    const origSendEmail = emailService.sendEmail;
    const origSendAgentReply = emailService.sendAgentReplyEmail;
    const origSendAutoReply = emailService.sendAutoReplyEmail;
    const origSendGraph = emailService.sendEmailViaGraph;

    emailService.sendEmail = async (opts) => {
        lastAutoReply = opts;
        autoReplyCount++;
        return { messageId: `<test-auto-reply-${Date.now()}-${autoReplyCount}@edgestone.in>` };
    };

    emailService.sendAgentReplyEmail = async (opts) => {
        lastAgentReply = opts;
        agentReplyCount++;
        return { messageId: `<test-agent-reply-${Date.now()}-${agentReplyCount}@edgestone.in>` };
    };

    emailService.sendAutoReplyEmail = async (opts) => {
        lastAutoReply = opts;
        autoReplyCount++;
        return { messageId: `<test-auto-reply-${Date.now()}-${autoReplyCount}@edgestone.in>` };
    };

    emailService.sendEmailViaGraph = async (opts) => {
        lastAgentReply = opts;
        agentReplyCount++;
        return { messageId: `<test-graph-${Date.now()}-${agentReplyCount}@edgestone.in>` };
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
        const ts = Date.now();

        // Setup Test Client
        const clientEmail = `client_${ts}@clientdomain.com`;
        const testClient = await prisma.client.create({
            data: {
                name: `Flow Test Client ${ts}`,
                emails: [clientEmail],
                createdOn: '10 Sep 2026'
            }
        });
        testClientId = testClient.id;

        // Setup Test Vendor
        const vendorEmail = `vendor_${ts}@telecomnoc.com`;
        const testVendor = await prisma.vendor.create({
            data: {
                name: `Flow Test Vendor ${ts}`,
                emails: [vendorEmail],
                status: 'Active',
                createdOn: '10 Sep 2026'
            }
        });
        testVendorId = testVendor.id;

        // Setup Circuit linking Client and Vendor
        const custCircuitId = `FLOW-CKT-${ts}`;
        const suppCircuitId = `FLOW-SUP-${ts}`;
        const circuit = await prisma.circuit.create({
            data: {
                customerCircuitId: custCircuitId,
                supplierCircuitId: suppCircuitId,
                client: { connect: { id: testClient.id } },
                vendor: { connect: { id: testVendor.id } }
            }
        });
        createdCircuitIds.push(circuit.id);

        // ═════════════════════════════════════════════════════════════════════
        // FLOW 1: Normal Ticketing Flow (Client email → Ticket → Auto-reply)
        // ═════════════════════════════════════════════════════════════════════
        console.log('--- FLOW 1: Normal Ticketing Flow (Client Email & Auto-Reply) ---');

        lastAutoReply = null;
        autoReplyCount = 0;

        const clientInitialEmail = {
            from: clientEmail,
            fromName: 'Alice Customer',
            subject: `Internet link flapping on ${custCircuitId}`,
            body: `Dear Support,\nOur link on circuit ${custCircuitId} is having high packet loss.\nPlease check.\nThanks,\nAlice`,
            messageId: `<client-init-${ts}@clientdomain.com>`,
            date: new Date().toISOString()
        };

        const ticketFlow1 = await ticketService.createTicketFromEmail(clientInitialEmail);
        assert(ticketFlow1 !== null, 'Client ticket was raised from incoming email');
        createdTicketIds.push(ticketFlow1.id);

        assert(ticketFlow1.ticketType === 'Client', `Ticket type is 'Client' (${ticketFlow1.ticketType})`);
        assert(ticketFlow1.clientId === testClient.id, `Ticket correctly mapped to Client ${testClient.name}`);
        assert(ticketFlow1.circuitId === custCircuitId, `Ticket mapped to customer circuit ${custCircuitId}`);
        assert(autoReplyCount === 1, `Auto-reply was triggered exactly once (count: ${autoReplyCount})`);
        assert(lastAutoReply !== null, 'Auto-reply payload exists');
        assert(Array.isArray(lastAutoReply.to) ? lastAutoReply.to.includes(clientEmail) : lastAutoReply.to === clientEmail, `Auto-reply recipient is client email (${lastAutoReply.to})`);
        assert(lastAutoReply.subject.includes(ticketFlow1.ticketId), `Auto-reply subject references ticket ID [${ticketFlow1.ticketId}]`);

        // ═════════════════════════════════════════════════════════════════════
        // FLOW 2: Client Threading & CC Retention Flow
        // ═════════════════════════════════════════════════════════════════════
        console.log('\n--- FLOW 2: Client Threading & CC Retention Flow ---');

        // 2a. Agent replies to client email and adds an internal supervisor CC
        lastAgentReply = null;
        const supervisorCc = `supervisor_${ts}@edgestone.in`;
        await ticketService.replyToTicket(
            ticketFlow1.id,
            'Hello Alice, we have initiated diagnostic loopback tests on your circuit.',
            envEmail,
            'Super Admin',
            null,
            [],
            {
                to: [clientEmail],
                cc: [supervisorCc],
                subject: `Re: [${ticketFlow1.ticketId}] ${ticketFlow1.header}`
            }
        );

        assert(lastAgentReply !== null, 'Agent reply email was dispatched');
        assert(lastAgentReply.to.includes(clientEmail), 'Agent reply dispatched to client');
        assert(lastAgentReply.cc.includes(supervisorCc), 'Agent reply includes added CC recipient');

        // Verify ticket in DB saved the supervisor CC
        const refreshedTicket1 = await prisma.ticket.findUnique({ where: { id: ticketFlow1.id } });
        assert(refreshedTicket1.cc.includes(supervisorCc), `Supervisor CC is persisted to ticket.cc (${refreshedTicket1.cc})`);

        // 2b. Client replies on the same thread AND adds a colleague in CC
        const colleagueCc = `colleague_${ts}@clientdomain.com`;
        const clientFollowupEmail = {
            from: clientEmail,
            fromName: 'Alice Customer',
            to: [envEmail],
            cc: [colleagueCc, supervisorCc],
            subject: `Re: [${ticketFlow1.ticketId}] ${ticketFlow1.header}`,
            body: 'Loopback test completed, adding our network lead Bob in CC.',
            messageId: `<client-reply-${ts}@clientdomain.com>`,
            inReplyTo: ticketFlow1.messageId,
            date: new Date().toISOString()
        };

        const clientReplyResult = await ticketService.createTicketFromEmail(clientFollowupEmail);
        assert(clientReplyResult !== null, 'Client followup reply was processed');
        assert(clientReplyResult.type === 'client', `Reply categorized as client thread (${clientReplyResult.type})`);

        const ticketAfterClientReply = await prisma.ticket.findUnique({ where: { id: ticketFlow1.id } });
        assert(ticketAfterClientReply.cc.includes(colleagueCc), `Client-added CC (${colleagueCc}) is captured in ticket.cc`);

        // 2c. The CCed colleague (Bob) replies to the thread
        const colleagueReplyEmail = {
            from: colleagueCc,
            fromName: 'Bob Network Lead',
            to: [envEmail],
            cc: [clientEmail, supervisorCc],
            subject: `Re: [${ticketFlow1.ticketId}] ${ticketFlow1.header}`,
            body: 'Confirming from our router logs that errors have reduced.',
            messageId: `<colleague-reply-${ts}@clientdomain.com>`,
            inReplyTo: `<client-reply-${ts}@clientdomain.com>`,
            date: new Date().toISOString()
        };

        const colleagueReplyResult = await ticketService.createTicketFromEmail(colleagueReplyEmail);
        assert(colleagueReplyResult !== null, 'CCed person reply was captured');
        assert(colleagueReplyResult.type === 'client', `CCed person reply correctly categorized under client thread`);
        assert(colleagueReplyResult.author === 'Bob Network Lead', `Author is CCed person (${colleagueReplyResult.author})`);

        // 2d. Our agent replies back -> must reach client AND all CCed persons
        lastAgentReply = null;
        // In the frontend, targetCc aggregates ticket.cc and reply.cc
        const fullRecipientCcList = Array.from(new Set([colleagueCc, supervisorCc]));
        await ticketService.replyToTicket(
            ticketFlow1.id,
            'Understood Bob. Link is now stable. We are monitoring for 24 hours.',
            envEmail,
            'Super Admin',
            null,
            [],
            {
                to: [clientEmail],
                cc: fullRecipientCcList,
                subject: `Re: [${ticketFlow1.ticketId}] ${ticketFlow1.header}`
            }
        );

        assert(lastAgentReply !== null, 'Agent follow-up reply dispatched');
        assert(lastAgentReply.to.includes(clientEmail), 'Dispatched to primary client');
        assert(lastAgentReply.cc.includes(colleagueCc), 'Dispatched to client CC recipient (Bob)');
        assert(lastAgentReply.cc.includes(supervisorCc), 'Dispatched to agent CC recipient (Supervisor)');

        // ═════════════════════════════════════════════════════════════════════
        // FLOW 3: Vendor Tab of the Same Ticket Flow
        // ═════════════════════════════════════════════════════════════════════
        console.log('\n--- FLOW 3: Vendor Tab of the Same Ticket Flow ---');

        // 3a. Agent reaches out to vendor from the Vendor tab of ticketFlow1
        lastAgentReply = null;
        const vendorNocCc = `vendor_escalations_${ts}@telecomnoc.com`;
        const vendorOutreachSubject = `Re: [${ticketFlow1.ticketId}-V] Issue regarding Circuit ${suppCircuitId}`;

        await vendorTicketingService.replyToVendor(
            ticketFlow1.id,
            {
                message: `Hi Vendor NOC, please investigate physical port for circuit ${suppCircuitId}.`,
                to: [vendorEmail],
                cc: [vendorNocCc],
                subject: vendorOutreachSubject
            },
            envEmail,
            'Super Admin'
        );

        assert(lastAgentReply !== null, 'Vendor outreach email was dispatched');
        assert(lastAgentReply.to.includes(vendorEmail), `Outreach sent to vendor email (${lastAgentReply.to})`);
        assert(lastAgentReply.cc.includes(vendorNocCc), `Outreach includes vendor CC (${lastAgentReply.cc})`);
        // Crucial security check: Client emails must NEVER be exposed in vendor visible CC!
        assert(!lastAgentReply.cc.includes(clientEmail), 'Client email is NOT leaked into visible vendor CC');
        assert(!lastAgentReply.cc.includes(colleagueCc), 'Client colleague email is NOT leaked into visible vendor CC');

        // 3b. Vendor replies back to that email with their own CC
        const vendorColleagueCc = `shiftlead_${ts}@telecomnoc.com`;
        const vendorReplyEmail = {
            from: vendorEmail,
            fromName: 'Telecom NOC Lead',
            to: [envEmail],
            cc: [vendorNocCc, vendorColleagueCc],
            subject: vendorOutreachSubject,
            body: 'We checked the exchange port and reseated the SFP module.',
            messageId: `<vendor-reply-${ts}@telecomnoc.com>`,
            inReplyTo: lastAgentReply.inReplyTo || ticketFlow1.messageId,
            date: new Date().toISOString()
        };

        const vendorReplyResult = await ticketService.createTicketFromEmail(vendorReplyEmail);
        assert(vendorReplyResult !== null, 'Vendor reply was successfully captured');
        assert(vendorReplyResult.type === 'vendor', `Reply type is 'vendor' (${vendorReplyResult.type})`);
        assert(vendorReplyResult.category.startsWith('vendor'), `Reply category is vendor thread (${vendorReplyResult.category})`);

        // Check that replies in DB are cleanly segregated:
        const allTicketReplies = await prisma.reply.findMany({ where: { ticketId: ticketFlow1.id } });
        const clientThreadReplies = allTicketReplies.filter(r => r.category === 'client' || (!r.category && r.type !== 'vendor'));
        const vendorThreadReplies = allTicketReplies.filter(r => r.category === 'vendor' || r.category?.startsWith('vendor_') || r.type === 'vendor');

        assert(clientThreadReplies.length >= 4, `Client thread contains client & agent replies (${clientThreadReplies.length})`);
        assert(vendorThreadReplies.length >= 2, `Vendor thread contains vendor & agent outreach replies (${vendorThreadReplies.length})`);

        // ═════════════════════════════════════════════════════════════════════
        // FLOW 4: Vendor Maintenance Mail Flow
        // ═════════════════════════════════════════════════════════════════════
        console.log('\n--- FLOW 4: Vendor Maintenance Mail Flow ---');

        lastAutoReply = null;
        autoReplyCount = 0;

        const maintIncomingMessageId = `<vendor-maint-${ts}@telecomnoc.com>`;
        const vendorMaintSubject = 'Planning a Scheduled Maintainence on Edge Network';

        const vendorMaintIncoming = {
            from: vendorEmail,
            fromName: 'AeroVendor Maintenance Desk',
            to: [envEmail],
            subject: vendorMaintSubject,
            body: `Planning a Scheduled Maintainence on circuit ID: ${suppCircuitId}\nWindow: 01:00 to 04:00 UTC\nExpected Impact: Brief link flap.\nRegards,\nNOC Team`,
            messageId: maintIncomingMessageId,
            date: new Date().toISOString()
        };

        const maintTicket = await ticketService.createTicketFromEmail(vendorMaintIncoming);
        assert(maintTicket !== null, 'Vendor maintenance ticket was raised');
        createdTicketIds.push(maintTicket.id);

        assert(maintTicket.ticketType === 'Vendor', `Ticket type is 'Vendor' (${maintTicket.ticketType})`);
        assert(maintTicket.ticketId.startsWith('#V'), `Ticket ID starts with '#V' (${maintTicket.ticketId})`);
        assert(maintTicket.header === vendorMaintSubject, `Ticket header matches vendor maintenance subject (${maintTicket.header})`);

        // Auto-reply MUST be suppressed for vendor-raised tickets
        assert(autoReplyCount === 0, `Auto-reply was SUPPRESSED for vendor maintenance ticket (count: ${autoReplyCount})`);

        // 4b. Agent tags ticket as Maintenance
        await prisma.ticket.update({
            where: { id: maintTicket.id },
            data: { isMaintenance: true, status: 'Maintenance' }
        });
        const updatedMaintTicket = await prisma.ticket.findUnique({ where: { id: maintTicket.id } });
        assert(updatedMaintTicket.isMaintenance === true, 'Ticket isMaintenance flag is true');
        assert(updatedMaintTicket.status === 'Maintenance', 'Ticket status is tagged as Maintenance');

        // 4c. Agent replies to the vendor maintenance email
        // The subject MUST preserve the vendor-provided subject and NOT use "Issue regarding Circuit"
        lastAgentReply = null;
        const expectedMaintReplySubject = `Re: [${maintTicket.ticketId}-V] ${vendorMaintSubject}`;

        await vendorTicketingService.replyToVendor(
            maintTicket.id,
            {
                message: 'Please notify us once the maintenance window is concluded.',
                to: [vendorEmail],
                subject: expectedMaintReplySubject
            },
            envEmail,
            'Super Admin'
        );

        assert(lastAgentReply !== null, 'Agent reply sent to vendor');
        assert(lastAgentReply.subject === expectedMaintReplySubject, `Outbound subject preserved vendor maintenance subject: ${lastAgentReply.subject}`);
        assert(!lastAgentReply.subject.includes('Issue regarding Circuit'), 'Subject does NOT contain unwanted generic circuit text');
        assert(lastAgentReply.inReplyTo === maintIncomingMessageId, `In-Reply-To references incoming vendor email (${lastAgentReply.inReplyTo})`);
        assert(lastAgentReply.references === maintIncomingMessageId, `References references incoming vendor email (${lastAgentReply.references})`);

        // 4d. Vendor replies back on the maintenance thread
        const vendorMaintFollowup = {
            from: vendorEmail,
            fromName: 'AeroVendor Maintenance Desk',
            to: [envEmail],
            subject: expectedMaintReplySubject,
            body: 'Maintenance completed successfully. All circuits operational.',
            messageId: `<vendor-maint-done-${ts}@telecomnoc.com>`,
            inReplyTo: lastAgentReply.inReplyTo,
            date: new Date().toISOString()
        };

        const vendorMaintReplyResult = await ticketService.createTicketFromEmail(vendorMaintFollowup);
        assert(vendorMaintReplyResult !== null, 'Vendor maintenance completion reply captured');
        assert(vendorMaintReplyResult.type === 'vendor', 'Reply belongs to vendor thread');

        console.log('\n========================================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED! ALL 4 FLOWS VERIFIED 100% OK!`);
        console.log('========================================================================\n');

    } catch (err) {
        console.error('❌ Test failed with error:', err);
        throw err;
    } finally {
        emailService.sendEmail = origSendEmail;
        emailService.sendAgentReplyEmail = origSendAgentReply;
        emailService.sendAutoReplyEmail = origSendAutoReply;
        emailService.sendEmailViaGraph = origSendGraph;

        console.log('🧹 Cleaning up test database records...');
        if (createdTicketIds.length > 0) {
            await prisma.reply.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
            await prisma.activityLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
            await prisma.sLARecord.deleteMany({ where: { ticketId: { in: createdTicketIds } } }).catch(() => {});
            await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
        }
        for (const cid of createdCircuitIds) {
            await prisma.circuit.delete({ where: { id: cid } }).catch(() => {});
        }
        if (testClientId) {
            await prisma.client.delete({ where: { id: testClientId } }).catch(() => {});
        }
        if (testVendorId) {
            await prisma.vendor.delete({ where: { id: testVendorId } }).catch(() => {});
        }
        console.log('✅ Cleanup complete.');
    }
}

runTests().catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
});
