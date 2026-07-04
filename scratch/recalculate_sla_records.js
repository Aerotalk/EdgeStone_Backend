const prisma = require('./models/index');
const { updateSLAClosure } = require('./services/slaRecordService');

async function main() {
    console.log('Recalculating existing closed SLA records with correct Asia/Kolkata timezone...');
    const closedRecords = await prisma.sLARecord.findMany({
        where: {
            closedTime: { not: null },
            closeDate: { not: null }
        }
    });

    for (const rec of closedRecords) {
        if (rec.closeDate !== '-' && rec.closedTime !== '-') {
            const ticket = await prisma.ticket.findUnique({ where: { id: rec.ticketId } });
            if (ticket && ticket.updatedAt) {
                const closeDate = ticket.updatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
                const closedTime = ticket.updatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).replace(/^24:/, '00:') + ' hrs';
                console.log(`Recalculating SLARecord ${rec.id} for ticketId ${rec.ticketId} with corrected close time ${closeDate} ${closedTime}...`);
                await updateSLAClosure(rec.id, closeDate, closedTime);
            } else {
                console.log(`Recalculating SLARecord ${rec.id} for ticketId ${rec.ticketId}...`);
                await updateSLAClosure(rec.id, rec.closeDate, rec.closedTime);
            }
        }
    }
    console.log('Recalculation complete.');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
