'use strict';

require('dotenv').config();
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');
const emailService = require('../services/emailService');

async function runTests() {
    console.log('========================================================================');
    console.log('🧪 TESTING: UNREGISTERED VENDOR MAINTENANCE & CIRCUIT ID VERIFICATION');
    console.log('========================================================================\n');

    const envEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER || 'support@edgestone.in';

    let autoReplyCount = 0;
    let lastAutoReply = null;
    const origSendEmail = emailService.sendEmail;
    const origSendAutoReply = emailService.sendAutoReplyEmail;

    emailService.sendEmail = async (opts) => {
        autoReplyCount++;
        lastAutoReply = opts;
        return { messageId: `<auto-reply-${Date.now()}@edgestone.in>` };
    };

    emailService.sendAutoReplyEmail = async (opts) => {
        autoReplyCount++;
        lastAutoReply = opts;
        return { messageId: `<auto-reply-${Date.now()}@edgestone.in>` };
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
    const createdCircuitIds = [];
    let testVendorId = null;
    let testClientId = null;

    try {
        const ts = Date.now();

        // 1. Setup Test Vendor: "Cognizant" with ONLY priyanshu.routh@cognizant.com registered
        const registeredVendorEmail = `priyanshu.routh_${ts}@cognizant.com`;
        const testVendor = await prisma.vendor.create({
            data: {
                name: `Cognizant Tech ${ts}`,
                emails: [registeredVendorEmail],
                status: 'Active',
                createdOn: '16 Sep 2026'
            }
        });
        testVendorId = testVendor.id;
        console.log(`🏢 Created Vendor ${testVendor.name} with registered email: ${registeredVendorEmail}`);

        // 2. Setup Test Client: "Acme Retail" with ops@acmeretail.com
        const registeredClientEmail = `ops_${ts}@acmeretail.com`;
        const testClient = await prisma.client.create({
            data: {
                name: `Acme Retail ${ts}`,
                emails: [registeredClientEmail],
                createdOn: '16 Sep 2026'
            }
        });
        testClientId = testClient.id;
        console.log(`👤 Created Client ${testClient.name} with registered email: ${registeredClientEmail}`);

        // 3. Setup Circuit linking Client and Vendor
        const customerCircuitId = `ACME-CKT-${ts}`;
        const supplierCircuitId = `COG-SUP-${ts}`;
        const circuit = await prisma.circuit.create({
            data: {
                customerCircuitId,
                supplierCircuitId,
                clientId: testClient.id,
                vendorId: testVendor.id
            }
        });
        createdCircuitIds.push(circuit.id);
        console.log(`🔗 Created Circuit: Customer ID = ${customerCircuitId} | Vendor/Supplier ID = ${supplierCircuitId}`);

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 1: Unregistered vendor team member (Soumyajit) sends Maintainence with Vendor Circuit ID
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- TEST 1: Unregistered vendor email + Vendor Circuit ID + "Maintainence" ---');
        autoReplyCount = 0;
        const unregisteredVendorEmail1 = `Soumyajit.dhar_${ts}@cognizant.com`;

        const incomingEmail1 = {
            from: unregisteredVendorEmail1,
            fromName: 'Soumyajit Dhar',
            to: [envEmail],
            subject: 'Planned Maintainence Activity on Edge Network',
            body: `Dear Support Team,\n\nWe have scheduled maintainence on Circuit ID: ${supplierCircuitId}.\nWindow: 02:00 to 05:00 UTC.\nPlease be advised.\n\nRegards,\nSoumyajit Dhar\nCognizant NOC Team`,
            messageId: `<vendor-maint-soumyajit-${ts}@cognizant.com>`,
            date: new Date().toISOString()
        };

        const ticket1 = await ticketService.createTicketFromEmail(incomingEmail1);
        assert(ticket1 !== null, 'Ticket was created');
        createdTicketIds.push(ticket1.id);

        assert(ticket1.ticketType === 'Vendor', `Ticket type is 'Vendor' (actual: ${ticket1.ticketType})`);
        assert(ticket1.ticketId.startsWith('#V'), `Ticket ID starts with '#V' (actual: ${ticket1.ticketId})`);
        assert(ticket1.isMaintenance === true, `Ticket isMaintenance is true (actual: ${ticket1.isMaintenance})`);
        assert(ticket1.status === 'Maintenance', `Ticket status is 'Maintenance' (actual: ${ticket1.status})`);
        assert(ticket1.vendorId === testVendor.id, `Ticket vendorId matches Cognizant (actual: ${ticket1.vendorId})`);
        assert(ticket1.circuitId === customerCircuitId, `Ticket circuitId correctly links to ${customerCircuitId}`);

        // Verify Auto-Reply Suppression
        assert(autoReplyCount === 0, `Auto-reply was SUPPRESSED for vendor maintenance email (count: ${autoReplyCount})`);

        // Verify Contact Auto-Registration
        const updatedVendor1 = await prisma.vendor.findUnique({ where: { id: testVendor.id } });
        const updatedClient1 = await prisma.client.findUnique({ where: { id: testClient.id } });

        assert(
            updatedVendor1.emails.map(e => e.toLowerCase()).includes(unregisteredVendorEmail1.toLowerCase()),
            `Unregistered vendor email ${unregisteredVendorEmail1} was AUTO-REGISTERED into Vendor.emails`
        );
        assert(
            !updatedClient1.emails.map(e => e.toLowerCase()).includes(unregisteredVendorEmail1.toLowerCase()),
            `Unregistered vendor email ${unregisteredVendorEmail1} was NOT added to Client.emails (Client contacts protected!)`
        );

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 2: Unregistered vendor team member sends Maintenance using Customer Circuit ID + Domain Match
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- TEST 2: Unregistered vendor email + Customer Circuit ID + Domain Match + Maintenance ---');
        autoReplyCount = 0;
        const unregisteredVendorEmail2 = `ananya.sen_${ts}@cognizant.com`;

        const incomingEmail2 = {
            from: unregisteredVendorEmail2,
            fromName: 'Ananya Sen',
            to: [envEmail],
            subject: `Emergency Maintenance Window on ${customerCircuitId}`,
            body: `Hello,\n\nEmergency maintenance in progress for circuit ${customerCircuitId}.\nLink stability might be affected.\n\nRegards,\nAnanya Sen`,
            messageId: `<vendor-maint-ananya-${ts}@cognizant.com>`,
            date: new Date().toISOString()
        };

        const ticket2 = await ticketService.createTicketFromEmail(incomingEmail2);
        assert(ticket2 !== null, 'Ticket was created');
        createdTicketIds.push(ticket2.id);

        assert(ticket2.ticketType === 'Vendor', `Ticket type is 'Vendor' via domain + maintenance (actual: ${ticket2.ticketType})`);
        assert(ticket2.ticketId.startsWith('#V'), `Ticket ID starts with '#V' (actual: ${ticket2.ticketId})`);
        assert(ticket2.isMaintenance === true, `Ticket isMaintenance is true (actual: ${ticket2.isMaintenance})`);
        assert(ticket2.status === 'Maintenance', `Ticket status is 'Maintenance' (actual: ${ticket2.status})`);
        assert(ticket2.vendorId === testVendor.id, `Ticket vendorId matches Cognizant (actual: ${ticket2.vendorId})`);
        assert(autoReplyCount === 0, `Auto-reply was SUPPRESSED (count: ${autoReplyCount})`);

        const updatedVendor2 = await prisma.vendor.findUnique({ where: { id: testVendor.id } });
        const updatedClient2 = await prisma.client.findUnique({ where: { id: testClient.id } });
        assert(
            updatedVendor2.emails.map(e => e.toLowerCase()).includes(unregisteredVendorEmail2.toLowerCase()),
            `Email ${unregisteredVendorEmail2} was AUTO-REGISTERED into Vendor.emails`
        );
        assert(
            !updatedClient2.emails.map(e => e.toLowerCase()).includes(unregisteredVendorEmail2.toLowerCase()),
            `Email ${unregisteredVendorEmail2} was NOT added to Client.emails`
        );

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 3: Regular Client Ticket (Regression Check)
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- TEST 3: Regular Client Ticket (Regression Check) ---');
        autoReplyCount = 0;

        const clientIncoming = {
            from: registeredClientEmail,
            fromName: 'Acme Operations Desk',
            to: [envEmail],
            subject: `Packet Loss Observed on ${customerCircuitId}`,
            body: `Hi Team,\n\nWe are noticing high packet loss on circuit ${customerCircuitId}.\nPlease investigate.\n\nThanks,\nAcme Ops`,
            messageId: `<client-ticket-${ts}@acmeretail.com>`,
            date: new Date().toISOString()
        };

        const ticket3 = await ticketService.createTicketFromEmail(clientIncoming);
        assert(ticket3 !== null, 'Client ticket was created');
        createdTicketIds.push(ticket3.id);

        assert(ticket3.ticketType === 'Client', `Ticket type is 'Client' (actual: ${ticket3.ticketType})`);
        assert(!ticket3.ticketId.startsWith('#V'), `Ticket ID does NOT start with '#V' (actual: ${ticket3.ticketId})`);
        assert(ticket3.clientId === testClient.id, `Ticket clientId matches Acme Retail (actual: ${ticket3.clientId})`);
        assert(ticket3.status === 'Open', `Ticket status is 'Open' (actual: ${ticket3.status})`);
        assert(ticket3.isMaintenance === false, `Ticket isMaintenance is false (actual: ${ticket3.isMaintenance})`);
        assert(autoReplyCount === 1, `Auto-reply WAS sent to client (count: ${autoReplyCount})`);

        console.log('\n========================================================================');
        console.log(`🎉 ALL TESTS PASSED: ${passedTests}/${totalTests}`);
        console.log('========================================================================\n');

    } catch (err) {
        console.error('❌ Test execution error:', err);
        throw err;
    } finally {
        // Cleanup test data
        emailService.sendEmail = origSendEmail;
        emailService.sendAutoReplyEmail = origSendAutoReply;

        try {
            if (createdTicketIds.length > 0) {
                await prisma.activityLog.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
                await prisma.reply.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
                await prisma.sLARecord.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
                await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
            }
            if (createdCircuitIds.length > 0) {
                await prisma.circuit.deleteMany({ where: { id: { in: createdCircuitIds } } });
            }
            if (testVendorId) {
                await prisma.vendor.delete({ where: { id: testVendorId } });
            }
            if (testClientId) {
                await prisma.client.delete({ where: { id: testClientId } });
            }
        } catch (cleanupErr) {
            console.warn('Cleanup error:', cleanupErr.message);
        }
        await prisma.$disconnect();
    }
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
