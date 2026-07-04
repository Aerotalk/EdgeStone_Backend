const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const slaRecordService = require('./services/slaRecordService');

async function fix1049() {
    try {
        const ticket = await prisma.ticket.findFirst({
            where: { ticketId: '#1049' }
        });
        if (!ticket) {
            console.log('Ticket #1049 not found');
            return;
        }

        const records = await prisma.sLARecord.findMany({
            where: { ticketId: ticket.id }
        });

        for (const record of records) {
            console.log(`Recalculating SLA for record ID: ${record.id}`);
            if (record.closeDate && record.closedTime) {
                await slaRecordService.updateSLAClosure(record.id, record.closeDate, record.closedTime);
            } else {
                console.log('Ticket does not have a close date/time yet');
            }
        }
        console.log('Done recalculating #1049');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

fix1049();
