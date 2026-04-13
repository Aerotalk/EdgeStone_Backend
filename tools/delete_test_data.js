const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Deleting test data ---");

    // 1. Find the test tickets
    const tickets = await prisma.ticket.findMany({
        where: {
            OR: [
                { header: { startsWith: 'e2e', mode: 'insensitive' } },
                { header: { contains: 'test', mode: 'insensitive' } },
                { email: { startsWith: 'e2e', mode: 'insensitive' } },
                { email: { contains: 'test', mode: 'insensitive' } }
            ]
        }
    });

    const ticketIds = tickets.map(t => t.id);
    if (ticketIds.length > 0) {
        console.log(`Deleting ${ticketIds.length} test tickets and their relations...`);
        // Delete related
        await prisma.reply.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.note.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.workNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.activityLog.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.sLARecord.deleteMany({ where: { ticketId: { in: ticketIds } } });
        // Delete tickets
        await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
        console.log("Test tickets deleted.");
    } else {
        console.log("No test tickets to delete.");
    }

    // 2. Find test clients and vendors
    const clients = await prisma.client.findMany({
        where: {
            OR: [
                { name: { startsWith: 'e2e', mode: 'insensitive' } },
                { name: { contains: 'test', mode: 'insensitive' } }
            ]
        }
    });

    const vendors = await prisma.vendor.findMany({
        where: {
            OR: [
                { name: { startsWith: 'e2e', mode: 'insensitive' } },
                { name: { contains: 'test', mode: 'insensitive' } }
            ]
        }
    });

    const clientIds = clients.map(c => c.id);
    const vendorIds = vendors.map(v => v.id);

    // If there were any tickets linked to these clients/vendors that weren't caught above, clear client/vendor ID
    if (clientIds.length > 0) {
        await prisma.ticket.updateMany({
            where: { clientId: { in: clientIds } },
            data: { clientId: null }
        });
    }
    if (vendorIds.length > 0) {
        await prisma.ticket.updateMany({
            where: { vendorId: { in: vendorIds } },
            data: { vendorId: null }
        });
    }

    // Delete SLAs associated with these
    const slasToDel = await prisma.sla.findMany({
        where: {
            OR: [
                { customerId: { in: clientIds.length > 0 ? clientIds : ['NONE'] } },
                { vendorId: { in: vendorIds.length > 0 ? vendorIds : ['NONE'] } }
            ]
        }
    });
    const slaIds = slasToDel.map(s => s.id);
    if (slaIds.length > 0) {
        console.log(`Deleting ${slaIds.length} SLAs linked to test clients/vendors...`);
        await prisma.slaRule.deleteMany({ where: { slaId: { in: slaIds } } });
        await prisma.slaAuditLog.deleteMany({ where: { slaId: { in: slaIds } } });
        await prisma.sla.deleteMany({ where: { id: { in: slaIds } } });
    }

    // Check circuits associated
    const circuitsToDel = await prisma.circuit.findMany({
        where: {
            OR: [
                { clientId: { in: clientIds.length > 0 ? clientIds : ['NONE'] } },
                { vendorId: { in: vendorIds.length > 0 ? vendorIds : ['NONE'] } }
            ]
        }
    });
    const circuitIds = circuitsToDel.map(c => c.id);
    if (circuitIds.length > 0) {
        console.log(`Deleting ${circuitIds.length} Circuits linked to test clients/vendors...`);
        // Any SLAs associated with these circuits need to be deleted
        const cSlas = await prisma.sla.findMany({ where: { circuitId: { in: circuitIds } } });
        const cSlaIds = cSlas.map(s => s.id);
        if (cSlaIds.length > 0) {
            await prisma.slaRule.deleteMany({ where: { slaId: { in: cSlaIds } } });
            await prisma.slaAuditLog.deleteMany({ where: { slaId: { in: cSlaIds } } });
            await prisma.sla.deleteMany({ where: { id: { in: cSlaIds } } });
        }
        await prisma.circuitSLAValue.deleteMany({ where: { circuitId: { in: circuitIds } } });
        
        await prisma.ticket.updateMany({
            where: { circuitId: { in: circuitIds } },
            data: { circuitId: null }
        });

        await prisma.circuit.deleteMany({ where: { id: { in: circuitIds } } });
    }

    // Now delete clients and vendors
    if (clientIds.length > 0) {
        console.log(`Deleting ${clientIds.length} test clients...`);
        await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    }

    if (vendorIds.length > 0) {
        console.log(`Deleting ${vendorIds.length} test vendors...`);
        await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    }

    console.log("Cleanup complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
