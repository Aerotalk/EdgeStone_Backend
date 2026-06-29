const prisma = require('./models/index');
const { updateSLAClosure } = require('./services/slaRecordService');

async function main() {
    console.log('Recalculating existing closed SLA records...');
    const closedRecords = await prisma.sLARecord.findMany({
        where: {
            closedTime: { not: null },
            closeDate: { not: null }
        }
    });

    for (const rec of closedRecords) {
        if (rec.closeDate !== '-' && rec.closedTime !== '-') {
            console.log(`Recalculating SLARecord ${rec.id} for ticketId ${rec.ticketId}...`);
            await updateSLAClosure(rec.id, rec.closeDate, rec.closedTime);
        }
    }
    console.log('Recalculation complete.');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
