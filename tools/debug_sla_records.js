const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
    // Get the latest few SLARecords
    const records = await prisma.sLARecord.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        include: { ticket: { select: { ticketId: true, circuitId: true } } }
    });
    records.forEach(r => {
        const startStr = `${r.startDate} ${(r.startTime||'').replace(' hrs', '')}`;
        const endStr   = `${r.closeDate} ${(r.closedTime||'').replace(' hrs', '')}`;
        const sTime = new Date(startStr);
        const eTime = new Date(endStr);
        const diffMins = (!isNaN(sTime) && !isNaN(eTime)) ? Math.round((eTime - sTime)/60000) : 'PARSE_ERR';
        console.log('Ticket:', r.ticket?.ticketId, '| circuitId:', r.ticket?.circuitId);
        console.log('  startDate:', r.startDate, '| startTime:', r.startTime);
        console.log('  closeDate:', r.closeDate, '| closedTime:', r.closedTime);
        console.log('  startStr parsed:', sTime, '| endStr parsed:', eTime);
        console.log('  diffMins:', diffMins);
        console.log('  DB compensation:', r.compensation, '| DB status:', r.status);
        console.log('---');
    });
    await prisma.$disconnect();
}
check().catch(e => { console.error(e.message); process.exit(1); });
