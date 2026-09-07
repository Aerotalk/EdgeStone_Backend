'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../models/index');

async function audit() {
    try {
        console.log('--- 1. AUDITING ALL CLIENTS ---');
        const clients = await prisma.client.findMany({
            include: { circuits: true, tickets: true }
        });
        for (const c of clients) {
            console.log(`Client [${c.name}] (ID: ${c.id})`);
            console.log(`  Emails: ${c.emails?.join(', ')}`);
            console.log(`  Circuits (${c.circuits.length}): ${c.circuits.map(x => x.customerCircuitId).join(', ') || 'None'}`);
            console.log(`  Tickets (${c.tickets.length}): ${c.tickets.map(t => `${t.ticketId} (ckt: ${t.circuitId})`).join(', ') || 'None'}`);
        }

        console.log('\n--- 2. AUDITING ALL CIRCUITS ---');
        const circuits = await prisma.circuit.findMany({
            include: { client: true, vendor: true }
        });
        for (const ckt of circuits) {
            console.log(`Circuit: ${ckt.customerCircuitId} | Supplier: ${ckt.supplierCircuitId} | Client: ${ckt.client?.name || 'NONE'} (${ckt.clientId}) | Vendor: ${ckt.vendor?.name || 'NONE'}`);
        }

        console.log('\n--- 3. AUDITING ALL TICKETS FOR CIRCUIT / CLIENT CONSISTENCY ---');
        const tickets = await prisma.ticket.findMany({
            include: { client: true, vendor: true, replies: true },
            orderBy: { createdAt: 'desc' }
        });

        let issuesFound = 0;
        for (const t of tickets) {
            console.log(`\nTicket ${t.ticketId}:`);
            console.log(`  Subject: ${t.header}`);
            console.log(`  Email (Raiser): ${t.email}`);
            console.log(`  CircuitId on Ticket: ${t.circuitId}`);
            console.log(`  ClientId on Ticket: ${t.clientId} (${t.client?.name || 'NO CLIENT'})`);
            console.log(`  VendorId on Ticket: ${t.vendorId} (${t.vendor?.name || 'NO VENDOR'})`);
            console.log(`  Type: ${t.ticketType}`);
            console.log(`  Replies: ${t.replies.length}`);

            // Check if ticket.circuitId belongs to a different client than ticket.clientId
            if (t.circuitId) {
                const ckt = circuits.find(c => c.customerCircuitId === t.circuitId || c.supplierCircuitId === t.circuitId);
                if (!ckt) {
                    console.warn(`  ⚠️ ISSUE: Ticket circuitId "${t.circuitId}" does NOT exist in circuits table!`);
                    issuesFound++;
                } else if (ckt.clientId && t.clientId && ckt.clientId !== t.clientId) {
                    console.warn(`  🚨 CRITICAL MISMATCH: Ticket has clientId=${t.clientId} (${t.client?.name}) but circuit belongs to clientId=${ckt.clientId} (${ckt.client?.name})!`);
                    issuesFound++;
                } else if (ckt.clientId && !t.clientId) {
                    console.warn(`  ⚠️ WARNING: Circuit has clientId=${ckt.clientId} but ticket.clientId is null!`);
                    issuesFound++;
                } else {
                    console.log(`  ✅ Circuit and Client are consistent (${ckt.client?.name || 'Unassigned'})`);
                }
            } else {
                console.log(`  ℹ️ Ticket has NO circuit assigned.`);
            }
        }

        console.log(`\n=== AUDIT FINISHED: ${issuesFound} issues found ===`);

    } catch (err) {
        console.error('Audit Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

audit();
