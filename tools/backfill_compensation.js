// Retrigger compensation for tickets that already have closeDate/closedTime set
// but were closed before the auto-compensation engine was added
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const slaRecordService = require('../services/slaRecordService');

async function backfill() {
    // Get all SLARecords that have a close date but compensation is still '-'
    const records = await prisma.sLARecord.findMany({
        where: {
            closeDate: { not: null },
            compensation: '-'
        },
        include: { ticket: { select: { id: true, ticketId: true, circuitId: true } } }
    });

    console.log(`Found ${records.length} closed SLARecords with no compensation calculated.`);

    for (const rec of records) {
        if (!rec.closeDate || !rec.closedTime) continue;
        if (!rec.ticket?.circuitId) {
            console.log(`Skipping ${rec.ticket?.ticketId} — no circuitId`);
            continue;
        }
        console.log(`Re-triggering compensation for ticket ${rec.ticket?.ticketId}...`);
        try {
            // Re-calling updateSLAClosure will re-run the engine with existing dates
            await slaRecordService.updateSLAClosure(rec.ticketId, rec.closeDate, rec.closedTime);
            console.log(`  Done.`);
        } catch(e) {
            console.error(`  Error: ${e.message}`);
        }
    }

    await prisma.$disconnect();
    console.log('Backfill complete.');
}

backfill().catch(e => { console.error(e.message); process.exit(1); });
