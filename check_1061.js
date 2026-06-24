const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const slaRecordService = require('./services/slaRecordService');

async function run() {
    const ticket = await prisma.ticket.findUnique({ where: { ticketId: '#1075' } });
    if (ticket) {
        await slaRecordService.updateSLAClosure(ticket.id, '30 Jul 2026', '04:03 hrs');
    }
    const records = await slaRecordService.getAllSLARecords({ search: '#1075' });
    console.log(JSON.stringify(records, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
