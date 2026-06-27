const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const slaRecordService = require('./services/slaRecordService');

async function run() {
    const ticket = await prisma.ticket.findUnique({ where: { ticketId: '#1075' } });
    if (ticket) {
        // Reset SLA totalDowntimeMinutes to 0 for the circuit
        await prisma.sla.updateMany({
            where: { circuitId: ticket.circuitId },
            data: { totalDowntimeMinutes: 0 }
        });
        // Reset SLARecord closeDate to null to simulate fresh closure
        await prisma.sLARecord.updateMany({
            where: { ticketId: ticket.id },
            data: { closeDate: null, closedTime: null }
        });
        await slaRecordService.updateSLAClosure(ticket.id, '30 Jul 2026', '04:03 hrs');
    }
    const records = await slaRecordService.getAllSLARecords({ search: '#1075' });
    console.log(JSON.stringify(records, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
