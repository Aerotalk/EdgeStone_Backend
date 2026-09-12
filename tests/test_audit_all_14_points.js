/**
 * test_audit_all_14_points.js
 * Comprehensive System Design Audit for all 14 checklist points
 * Using: OurClient, OurVendor, YourVendor, and Multi-vendor circuit N1/TEST11/2027
 */

'use strict';

const assert = require('assert');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ticketService = require('../services/ticketService');
const vendorTicketingService = require('../services/vendorTicketingService');
const emailService = require('../services/emailService');
const slaRecordService = require('../services/slaRecordService');
const slaService = require('../services/slaService');

// Capture outbound emails
const outboundEmails = [];
const originalSendViaGraph = emailService.sendEmail;
const originalSendAgentReply = emailService.sendAgentReplyEmail;

emailService.sendEmail = async (opts) => {
    outboundEmails.push({ type: 'sendEmail', ...opts });
    return { messageId: `<mock-send-${Date.now()}-${Math.random().toString(36).substring(7)}@edgestone.in>` };
};

emailService.sendAgentReplyEmail = async (opts) => {
    const msgId = `<mock-reply-${Date.now()}-${Math.random().toString(36).substring(7)}@edgestone.in>`;
    outboundEmails.push({ type: 'sendAgentReplyEmail', messageId: msgId, ...opts });
    return { messageId: msgId };
};

async function runAudit() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔍 AUDIT TEST: ALL 14 POINTS ON OurClient, OurVendor & MultiVendor');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const createdTicketIds = [];
    const testResults = {};

    try {
        // Step 0: Fetch test entities
        const ourClient = await prisma.client.findFirst({ where: { name: 'OurClient' } });
        const ourVendor = await prisma.vendor.findFirst({ where: { name: 'OurVendor' } });
        const yourVendor = await prisma.vendor.findFirst({ where: { name: 'YourVendor' } });
        const mvCircuit = await prisma.circuit.findFirst({
            where: { customerCircuitId: 'N1/TEST11/2027' },
            include: { vendorCircuits: { include: { vendor: true } }, client: true }
        });

        assert(ourClient, 'OurClient must exist');
        assert(ourVendor, 'OurVendor must exist');
        assert(yourVendor, 'YourVendor must exist');
        assert(mvCircuit, 'Multi-vendor circuit N1/TEST11/2027 must exist');

        const clientEmail = ourClient.emails[0]; // priyanshu@aerotalk.in
        const vendor1Email = ourVendor.emails[0]; // ashish1002singh@gmail.com
        const vendor2Email = yourVendor.emails[0]; // soumyajitdhar50@gmail.com
        const circuitId = mvCircuit.customerCircuitId; // N1/TEST11/2027

        console.log(`Entities Loaded:`);
        console.log(`- Client: ${ourClient.name} (${clientEmail})`);
        console.log(`- Vendor 1: ${ourVendor.name} (${vendor1Email}) [ID: ${ourVendor.id}]`);
        console.log(`- Vendor 2: ${yourVendor.name} (${vendor2Email}) [ID: ${yourVendor.id}]`);
        console.log(`- Circuit: ${circuitId} (MultiVendor: ${mvCircuit.isMultiVendor})\n`);

        // ─────────────────────────────────────────────────────────────
        // 1. POINT 1: Ticket Raising from Client Side
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 1: Ticket Raising from Client Side ---');
        outboundEmails.length = 0;
        const p1MsgId = `<client-init-${Date.now()}@aerotalk.in>`;
        const clientTicket = await ticketService.createTicketFromEmail({
            from: clientEmail,
            fromName: 'OurClient Admin',
            to: ['support@edgestone.in'],
            cc: ['colleague1@aerotalk.in'],
            subject: `Issue on circuit ${circuitId} - High Latency`,
            body: `Hello Team,\nWe are noticing high packet drop on circuit ${circuitId}.\nPlease check urgently.`,
            messageId: p1MsgId,
            date: new Date()
        });

        if (clientTicket) {
            createdTicketIds.push(clientTicket.id);
            const hasAutoReply = outboundEmails.some(e => e.type === 'sendEmail' && e.to.includes(clientEmail));
            const passed = clientTicket.ticketType === 'Client' &&
                           clientTicket.circuitId === circuitId &&
                           clientTicket.clientId === ourClient.id &&
                           hasAutoReply;
            testResults['Point 1: Ticket Raising from Client Side'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Ticket: ${clientTicket.ticketId}, Type: ${clientTicket.ticketType}, Auto-reply sent: ${hasAutoReply}`
            };
        } else {
            testResults['Point 1: Ticket Raising from Client Side'] = {
                status: 'FAIL',
                details: 'Ticket was null (dropped by circuit gateway)'
            };
        }
        console.log(`Result:`, testResults['Point 1: Ticket Raising from Client Side'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 2. POINT 2: Reply in Client Tab
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 2: Reply in Client Tab ---');
        outboundEmails.length = 0;
        let clientReply = null;
        try {
            clientReply = await ticketService.replyToTicket(
                clientTicket.id,
                'Dear Client, We have initiated loop tests on your link.',
                'agent@edgestone.in',
                'NOC Agent',
                null,
                [],
                {
                    to: [clientEmail],
                    cc: ['colleague1@aerotalk.in'],
                    subject: `Re: [${clientTicket.ticketId}] Issue on circuit ${circuitId}`
                }
            );

            const sentClientEmail = outboundEmails.find(e => e.type === 'sendAgentReplyEmail');
            const clientSla = await prisma.sLARecord.findFirst({
                where: { ticketId: clientTicket.id, type: 'CLIENT' }
            });

            const passed = clientReply &&
                           clientReply.category === 'client' &&
                           clientReply.type === 'agent' &&
                           sentClientEmail &&
                           sentClientEmail.to.includes(clientEmail) &&
                           clientSla !== null;

            testResults['Point 2: Reply in Client Tab'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Reply ID: ${clientReply?.id}, Category: ${clientReply?.category}, SLA started: ${!!clientSla}`
            };
        } catch (err) {
            testResults['Point 2: Reply in Client Tab'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 2: Reply in Client Tab'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 3. POINT 3: Reaching Out to Vendor from Vendor Tab
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 3: Reaching Out to Vendor from Vendor Tab ---');
        outboundEmails.length = 0;
        let vendor1Outreach = null;
        try {
            // Test 3a: Explicit TO passed by frontend
            vendor1Outreach = await vendorTicketingService.replyToVendor(
                clientTicket.id,
                {
                    to: [vendor1Email],
                    cc: ['vendor_noc@ourvendor.com'],
                    message: 'Hello Vendor, please check circuit segment.',
                    vendorId: ourVendor.id,
                    subject: `Re: [${clientTicket.ticketId}-V] Issue regarding Circuit N1/TESTV12/2027`
                },
                'agent@edgestone.in',
                'NOC Agent'
            );

            // Test 3b: Fallback when TO is empty (testing backend vendor email resolution)
            let fallbackSucceeded = false;
            try {
                const fallbackOutreach = await vendorTicketingService.replyToVendor(
                    clientTicket.id,
                    {
                        to: [],
                        message: 'Fallback test without explicit TO.',
                        vendorId: ourVendor.id
                    },
                    'agent@edgestone.in',
                    'NOC Agent'
                );
                fallbackSucceeded = !!fallbackOutreach;
            } catch (fbErr) {
                console.log(`⚠️ Fallback without explicit TO failed: ${fbErr.message}`);
                fallbackSucceeded = false;
            }

            const sentVendorEmail = outboundEmails.find(e => e.to && e.to.includes(vendor1Email));
            const passed = vendor1Outreach &&
                           vendor1Outreach.category === `vendor_${ourVendor.id}` &&
                           sentVendorEmail !== undefined;

            testResults['Point 3: Reaching Out to Vendor from Vendor Tab'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Outreach category: ${vendor1Outreach?.category}, Outbound email to vendor: ${!!sentVendorEmail}, Empty TO fallback: ${fallbackSucceeded ? 'PASS' : 'FAIL (requires explicit TO)'}`
            };
        } catch (err) {
            testResults['Point 3: Reaching Out to Vendor from Vendor Tab'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 3: Reaching Out to Vendor from Vendor Tab'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 4. POINT 4: Vendor Replies in Client Ticket's Vendor Tab
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 4: Vendor Replies in Client Ticket\'s Vendor Tab ---');
        outboundEmails.length = 0;
        const vendor1ReplyMsgId = `<vendor1-reply-${Date.now()}@ourvendor.com>`;
        let vendorReplyResult = null;
        try {
            vendorReplyResult = await ticketService.createTicketFromEmail({
                from: vendor1Email,
                fromName: 'OurVendor NOC Engineer',
                to: ['support@edgestone.in'],
                subject: `Re: [${clientTicket.ticketId}-V] Issue regarding Circuit N1/TESTV12/2027`,
                body: 'We have tested our segment and fiber levels are within spec.',
                messageId: vendor1ReplyMsgId,
                inReplyTo: vendor1Outreach?.messageId || null,
                date: new Date()
            });

            // Fetch newly appended reply
            const updatedReplies = await prisma.reply.findMany({
                where: { ticketId: clientTicket.id, messageId: vendor1ReplyMsgId }
            });
            const appendedVendorRep = updatedReplies[0];

            // Check Vendor SLA clock
            const vendorSla = await prisma.sLARecord.findFirst({
                where: { ticketId: clientTicket.id, type: 'VENDOR' }
            });

            const passed = appendedVendorRep &&
                           appendedVendorRep.type === 'vendor' &&
                           appendedVendorRep.category === `vendor_${ourVendor.id}` &&
                           vendorSla !== null;

            testResults['Point 4: Vendor Replies in Vendor Tab'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Reply category: ${appendedVendorRep?.category}, Type: ${appendedVendorRep?.type}, Vendor SLA started: ${!!vendorSla}`
            };
        } catch (err) {
            testResults['Point 4: Vendor Replies in Vendor Tab'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 4: Vendor Replies in Vendor Tab'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 5. POINT 5: Replies from CCs are Captured
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 5: Replies from CCs are Captured ---');
        const ccReplyMsgId = `<cc-reply-${Date.now()}@aerotalk.in>`;
        try {
            const ccReplyResult = await ticketService.createTicketFromEmail({
                from: 'colleague1@aerotalk.in',
                fromName: 'Client Colleague',
                to: ['support@edgestone.in', clientEmail],
                subject: `Re: [${clientTicket.ticketId}] Issue on circuit ${circuitId}`,
                body: 'FYI we are also seeing high packet loss from the branch office.',
                messageId: ccReplyMsgId,
                inReplyTo: clientReply?.messageId || p1MsgId,
                date: new Date()
            });

            const ccRep = await prisma.reply.findFirst({
                where: { ticketId: clientTicket.id, messageId: ccReplyMsgId }
            });

            const passed = ccRep &&
                           ccRep.type === 'client' &&
                           ccRep.category === 'client';

            testResults['Point 5: Replies from CCs Captured'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Captured: ${!!ccRep}, Category: ${ccRep?.category}, Type: ${ccRep?.type}`
            };
        } catch (err) {
            testResults['Point 5: Replies from CCs Captured'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 5: Replies from CCs Captured'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 6. POINT 6: Mail to CCs are Delivered
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 6: Mail to CCs Delivered ---');
        outboundEmails.length = 0;
        try {
            await ticketService.replyToTicket(
                clientTicket.id,
                'Update to client and CC recipients',
                'agent@edgestone.in',
                'NOC Agent',
                null,
                [],
                {
                    to: [clientEmail],
                    cc: ['colleague1@aerotalk.in', ' colleague2@aerotalk.in ', 'colleague3@aerotalk.in,colleague4@aerotalk.in'],
                    subject: `Re: [${clientTicket.ticketId}] Update`
                }
            );

            const sentEmail = outboundEmails.find(e => e.type === 'sendAgentReplyEmail');
            const hasCcs = sentEmail && sentEmail.cc && sentEmail.cc.length >= 2;
            const passed = hasCcs && sentEmail.cc.some(c => c.includes('colleague1@aerotalk.in'));

            testResults['Point 6: Mail to CCs Delivered'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Outbound CCs count: ${sentEmail?.cc?.length}, CCs: ${sentEmail?.cc?.join(', ')}`
            };
        } catch (err) {
            testResults['Point 6: Mail to CCs Delivered'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 6: Mail to CCs Delivered'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 7. POINT 7: In Client Tab, Client CC Maintained
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 7: Client CC Maintained in Client Tab ---');
        try {
            const freshTicket = await prisma.ticket.findUnique({ where: { id: clientTicket.id } });
            const ccs = freshTicket.cc || [];
            const hasInitialCc = ccs.includes('colleague1@aerotalk.in');
            testResults['Point 7: Client CC Maintained'] = {
                status: hasInitialCc ? 'PASS' : 'FAIL',
                details: `ticket.cc entries: [${ccs.join(', ')}]`
            };
        } catch (err) {
            testResults['Point 7: Client CC Maintained'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 7: Client CC Maintained'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 8. POINT 8: Segregation of Client CCs vs Vendor CCs
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 8: Segregation of Client CCs vs Vendor CCs ---');
        try {
            // Check if any vendor email ended up in ticket.cc
            const freshTicket = await prisma.ticket.findUnique({ where: { id: clientTicket.id } });
            const ticketCcs = freshTicket.cc || [];
            const hasVendorInClientCc = ticketCcs.some(c => c.toLowerCase() === vendor1Email.toLowerCase() || c.toLowerCase() === vendor2Email.toLowerCase());

            // Check if vendor outreach CC leaks client email
            outboundEmails.length = 0;
            await vendorTicketingService.replyToVendor(
                clientTicket.id,
                {
                    to: [vendor1Email],
                    cc: [clientEmail, 'vendor_esc@ourvendor.com'], // Accidental client email passed in CC
                    message: 'Vendor inquiry'
                },
                'agent@edgestone.in',
                'NOC Agent'
            );

            const vendorOutbound = outboundEmails.find(e => e.to && e.to.includes(vendor1Email));
            const clientInVendorVisibleCc = vendorOutbound?.cc?.some(c => c.toLowerCase() === clientEmail.toLowerCase());
            const clientMovedToBcc = vendorOutbound?.bcc?.some(b => b.toLowerCase() === clientEmail.toLowerCase());

            const passed = !hasVendorInClientCc && !clientInVendorVisibleCc && clientMovedToBcc;
            testResults['Point 8: CC Segregation (Client vs Vendor)'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Vendor in ticket.cc: ${hasVendorInClientCc}, Client in vendor visible CC: ${clientInVendorVisibleCc}, Client moved to BCC: ${clientMovedToBcc}`
            };
        } catch (err) {
            testResults['Point 8: CC Segregation (Client vs Vendor)'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 8: CC Segregation (Client vs Vendor)'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 9. POINT 9: Any Mails Going Randomly into CCs
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 9: Random Mails Going into CCs ---');
        try {
            // Simulate client replying with vendor in TO/CC headers
            const contaminatedReplyMsgId = `<contam-reply-${Date.now()}@aerotalk.in>`;
            await ticketService.createTicketFromEmail({
                from: clientEmail,
                fromName: 'OurClient Admin',
                to: ['support@edgestone.in', vendor1Email], // Vendor accidentally included
                cc: ['vendor_colleague@ourvendor.com', 'client_vp@aerotalk.in'],
                subject: `Re: [${clientTicket.ticketId}] Issue on circuit ${circuitId}`,
                body: 'Still experiencing issues.',
                messageId: contaminatedReplyMsgId,
                inReplyTo: clientReply?.messageId || p1MsgId,
                date: new Date()
            });

            const freshTicket = await prisma.ticket.findUnique({ where: { id: clientTicket.id } });
            const ticketCcs = freshTicket.cc || [];
            const vendorContamination = ticketCcs.filter(c => c.includes('ourvendor.com') || c === vendor1Email.toLowerCase());

            const passed = vendorContamination.length === 0;
            testResults['Point 9: No Random Mails in CCs'] = {
                status: passed ? 'PASS' : 'FAIL (Vendor leaked into ticket.cc)',
                details: `Contaminating emails found in ticket.cc: [${vendorContamination.join(', ')}]`
            };
        } catch (err) {
            testResults['Point 9: No Random Mails in CCs'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 9: No Random Mails in CCs'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 10. POINT 10: Maintenance Tickets Raising
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 10: Maintenance Tickets Raising ---');
        outboundEmails.length = 0;
        const maintMsgId = `<vendor-maint-init-${Date.now()}@ourvendor.com>`;
        let maintTicket = null;
        try {
            maintTicket = await ticketService.createTicketFromEmail({
                from: vendor1Email,
                fromName: 'OurVendor Operations',
                to: ['support@edgestone.in'],
                subject: `Emergency Maintenance Notification on ${circuitId}`,
                body: `Dear Partner,\nWe have scheduled Emergency Maintenance on circuit ${circuitId} from 02:00 to 04:00 UTC.`,
                messageId: maintMsgId,
                date: new Date()
            });

            if (maintTicket) createdTicketIds.push(maintTicket.id);

            const autoReplySent = outboundEmails.some(e => e.type === 'sendEmail' && e.to.includes(vendor1Email));
            const isTaggedMaint = maintTicket?.isMaintenance === true || maintTicket?.status === 'Maintenance';
            const isVendorType = maintTicket?.ticketType === 'Vendor';

            testResults['Point 10: Maintenance Tickets Raising'] = {
                status: (maintTicket && isVendorType && !autoReplySent) ? (isTaggedMaint ? 'PASS' : 'WARN (Auto-tagging missing)') : 'FAIL',
                details: `Ticket: ${maintTicket?.ticketId}, Type: ${maintTicket?.ticketType}, isMaintenance: ${maintTicket?.isMaintenance}, Status: ${maintTicket?.status}, Auto-reply suppressed: ${!autoReplySent}`
            };
        } catch (err) {
            testResults['Point 10: Maintenance Tickets Raising'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 10: Maintenance Tickets Raising'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 11. POINT 11: Vendors Able to Reply for Maintenance Tickets
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 11: Vendors Replying to Maintenance Tickets ---');
        const maintReplyMsgId = `<vendor-maint-rep-${Date.now()}@ourvendor.com>`;
        try {
            // First agent acknowledges maintenance
            outboundEmails.length = 0;
            const agentMaintAck = await vendorTicketingService.replyToVendor(
                maintTicket.id,
                {
                    to: [vendor1Email],
                    message: 'Acknowledged maintenance window.',
                    vendorId: ourVendor.id,
                    subject: `Re: [${maintTicket.ticketId}-V] Emergency Maintenance Notification on ${circuitId}`
                },
                'agent@edgestone.in',
                'NOC Agent'
            );

            // Vendor replies with completion
            await ticketService.createTicketFromEmail({
                from: vendor1Email,
                fromName: 'OurVendor Operations',
                to: ['support@edgestone.in'],
                subject: `Re: [${maintTicket.ticketId}-V] Emergency Maintenance Notification on ${circuitId}`,
                body: 'Maintenance has been successfully completed. Circuit is normalized.',
                messageId: maintReplyMsgId,
                inReplyTo: agentMaintAck?.messageId || maintMsgId,
                date: new Date()
            });

            const rep = await prisma.reply.findFirst({
                where: { ticketId: maintTicket.id, messageId: maintReplyMsgId }
            });

            const passed = rep &&
                           rep.type === 'vendor' &&
                           (rep.category === 'vendor' || rep.category?.startsWith('vendor_'));

            testResults['Point 11: Vendor Reply to Maintenance'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Captured: ${!!rep}, Category: ${rep?.category}, Type: ${rep?.type}`
            };
        } catch (err) {
            testResults['Point 11: Vendor Reply to Maintenance'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 11: Vendor Reply to Maintenance'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 12. POINT 12: SLA Calculation Working Properly
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 12: SLA Calculation Working Properly ---');
        try {
            const clientSlaBefore = await prisma.sLARecord.findFirst({
                where: { ticketId: clientTicket.id, type: 'CLIENT' }
            });
            const vendorSlaBefore = await prisma.sLARecord.findFirst({
                where: { ticketId: clientTicket.id, type: 'VENDOR' }
            });

            // Close ticket to trigger SLA calculation
            await ticketService.updateTicket(clientTicket.id, { status: 'Closed' }, 'NOC Agent');

            const clientSlaAfter = await prisma.sLARecord.findFirst({
                where: { ticketId: clientTicket.id, type: 'CLIENT' }
            });
            const vendorSlaAfter = await prisma.sLARecord.findFirst({
                where: { ticketId: clientTicket.id, type: 'VENDOR' }
            });

            const clientClosed = clientSlaAfter?.closeDate && clientSlaAfter?.closedTime;
            const vendorClosed = vendorSlaAfter?.closeDate && vendorSlaAfter?.closedTime;

            const passed = clientSlaBefore && vendorSlaBefore && clientClosed && vendorClosed;
            testResults['Point 12: SLA Calculation'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Client SLA: [Start: ${clientSlaAfter?.startTime}, Close: ${clientSlaAfter?.closedTime}, Status: ${clientSlaAfter?.status}], Vendor SLA: [Start: ${vendorSlaAfter?.startTime}, Close: ${vendorSlaAfter?.closedTime}, Status: ${vendorSlaAfter?.status}]`
            };
        } catch (err) {
            testResults['Point 12: SLA Calculation'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 12: SLA Calculation'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 13. POINT 13: Multi-Vendor Reply Routing
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 13: Multi-Vendor Reply Routing ---');
        const mvTicketMsgId = `<mv-ticket-${Date.now()}@aerotalk.in>`;
        let mvClientTicket = null;
        try {
            mvClientTicket = await ticketService.createTicketFromEmail({
                from: clientEmail,
                fromName: 'OurClient Admin',
                to: ['support@edgestone.in'],
                subject: `Multi-Vendor outage on ${circuitId}`,
                body: `Both paths down on circuit ${circuitId}`,
                messageId: mvTicketMsgId,
                date: new Date()
            });
            if (mvClientTicket) createdTicketIds.push(mvClientTicket.id);

            // Outreach to Vendor 1 (OurVendor)
            const v1Outreach = await vendorTicketingService.replyToVendor(
                mvClientTicket.id,
                {
                    to: [vendor1Email],
                    message: 'Outreach to Vendor 1',
                    vendorId: ourVendor.id,
                    subject: `Re: [${mvClientTicket.ticketId}-V] Query for OurVendor`
                },
                'agent@edgestone.in',
                'NOC Agent'
            );

            // Outreach to Vendor 2 (YourVendor)
            const v2Outreach = await vendorTicketingService.replyToVendor(
                mvClientTicket.id,
                {
                    to: [vendor2Email],
                    message: 'Outreach to Vendor 2',
                    vendorId: yourVendor.id,
                    subject: `Re: [${mvClientTicket.ticketId}-V] Query for YourVendor`
                },
                'agent@edgestone.in',
                'NOC Agent'
            );

            // Vendor 1 Replies
            const v1ReplyMsgId = `<v1-rep-${Date.now()}@ourvendor.com>`;
            await ticketService.createTicketFromEmail({
                from: vendor1Email,
                fromName: 'OurVendor NOC',
                to: ['support@edgestone.in'],
                subject: `Re: [${mvClientTicket.ticketId}-V] Query for OurVendor`,
                body: 'OurVendor link is normal.',
                messageId: v1ReplyMsgId,
                inReplyTo: v1Outreach?.messageId,
                date: new Date()
            });

            // Vendor 2 Replies
            const v2ReplyMsgId = `<v2-rep-${Date.now()}@yourvendor.com>`;
            await ticketService.createTicketFromEmail({
                from: vendor2Email,
                fromName: 'YourVendor NOC',
                to: ['support@edgestone.in'],
                subject: `Re: [${mvClientTicket.ticketId}-V] Query for YourVendor`,
                body: 'YourVendor link has fiber cut.',
                messageId: v2ReplyMsgId,
                inReplyTo: v2Outreach?.messageId,
                date: new Date()
            });

            const r1 = await prisma.reply.findFirst({ where: { ticketId: mvClientTicket.id, messageId: v1ReplyMsgId } });
            const r2 = await prisma.reply.findFirst({ where: { ticketId: mvClientTicket.id, messageId: v2ReplyMsgId } });

            const passed = r1 && r2 &&
                           r1.category === `vendor_${ourVendor.id}` &&
                           r2.category === `vendor_${yourVendor.id}`;

            testResults['Point 13: Multi-Vendor Reply Routing'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `V1 Reply Category: ${r1?.category} (expected vendor_${ourVendor.id}), V2 Reply Category: ${r2?.category} (expected vendor_${yourVendor.id})`
            };
        } catch (err) {
            testResults['Point 13: Multi-Vendor Reply Routing'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 13: Multi-Vendor Reply Routing'], '\n');

        // ─────────────────────────────────────────────────────────────
        // 14. POINT 14: Multi-Vendor Circuits Mail Loadings & Tab Isolation
        // ─────────────────────────────────────────────────────────────
        console.log('--- Checking Point 14: Multi-Vendor Circuits Mail Loadings ---');
        try {
            // Test SSOT matcher logic from TicketReplyView.tsx
            const isReplyForTab = (reply, tab, circuit) => {
                if (!reply) return false;
                if (tab === 'client') {
                    return reply.category === 'client' || (!reply.category && reply.type !== 'vendor');
                }
                if (tab === 'vendor') {
                    return reply.category === 'vendor' || reply.category?.startsWith('vendor_') || reply.type === 'vendor';
                }
                if (tab.startsWith('vendor_')) {
                    if (reply.category === tab) return true;
                    if (reply.category === 'vendor') {
                        const currentVendorId = tab.replace('vendor_', '');
                        const currentVc = circuit?.vendorCircuits?.find(vc => vc.vendorId === currentVendorId);
                        const vendorEmails = (currentVc?.vendor?.emails || []).map(e => e.toLowerCase().trim());
                        const vendorName = currentVc?.vendor?.name?.toLowerCase().trim();
                        const participants = [
                            ...(reply.to || []),
                            ...(reply.cc || []),
                            reply.author || ''
                        ].map(t => t.toLowerCase().trim());

                        if (reply.type === 'agent') {
                            const replyTos = [
                                ...(reply.to || []),
                                ...(reply.cc || [])
                            ].map(t => t.toLowerCase().trim());

                            if (vendorEmails.length > 0 && replyTos.some(t => vendorEmails.includes(t))) {
                                return true;
                            }

                            // If it matches another vendor on this circuit, it must NOT show in this vendor's tab!
                            if (circuit?.vendorCircuits && circuit.vendorCircuits.length > 1) {
                                const matchesOtherVendor = circuit.vendorCircuits.some(vc => {
                                    if (vc.vendorId === currentVendorId) return false;
                                    const otherEmails = (vc.vendor?.emails || []).map(e => e.toLowerCase().trim());
                                    return replyTos.some(t => otherEmails.includes(t));
                                });
                                if (matchesOtherVendor) return false;
                            }

                            return circuit?.vendorCircuits?.length === 1;
                        }

                        if (reply.type === 'vendor') {
                            const matchesEmail = vendorEmails.some(e => participants.some(p => p.includes(e)));
                            const matchesAuthor = vendorName && (reply.author?.toLowerCase().includes(vendorName) || participants.some(p => p.includes(vendorName)));
                            if (matchesEmail || matchesAuthor) return true;
                            if (circuit?.vendorCircuits?.length === 1) return true;
                        }
                    }
                    return false;
                }
                return reply.category === tab;
            };

            // Test mock legacy reply with category 'vendor' sent to YourVendor
            const legacyReplyForV2 = {
                type: 'agent',
                category: 'vendor',
                to: [vendor2Email],
                author: 'Agent'
            };

            const showsInV1 = isReplyForTab(legacyReplyForV2, `vendor_${ourVendor.id}`, mvCircuit);
            const showsInV2 = isReplyForTab(legacyReplyForV2, `vendor_${yourVendor.id}`, mvCircuit);

            // In ideal design, showsInV1 should be FALSE and showsInV2 should be TRUE!
            const passed = !showsInV1 && showsInV2;

            testResults['Point 14: Multi-Vendor Mail Loadings & Tab Isolation'] = {
                status: passed ? 'PASS' : 'FAIL',
                details: `Reply addressed to V2 shows in V1 tab: ${showsInV1} (expected false), shows in V2 tab: ${showsInV2} (expected true)`
            };
        } catch (err) {
            testResults['Point 14: Multi-Vendor Mail Loadings & Tab Isolation'] = { status: 'FAIL', details: err.message };
        }
        console.log(`Result:`, testResults['Point 14: Multi-Vendor Mail Loadings & Tab Isolation'], '\n');

        // ─────────────────────────────────────────────────────────────
        // SUMMARY
        // ─────────────────────────────────────────────────────────────
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 AUDIT SUMMARY TABLE');
        console.log('═══════════════════════════════════════════════════════════════');
        console.table(testResults);

    } finally {
        // Clean up created tickets
        console.log('\n🧹 Cleaning up test tickets...');
        for (const tid of createdTicketIds) {
            try {
                await ticketService.deleteTicket(tid);
            } catch (_) {}
        }
        await prisma.$disconnect();
    }
}

runAudit().catch(err => {
    console.error('Audit Script Crashed:', err);
    process.exit(1);
});
