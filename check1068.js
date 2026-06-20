const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ticket = await prisma.ticket.findUnique({
        where: { ticketId: '#1068' },
        include: { slaRecords: true, replies: true }
    });
    console.log(JSON.stringify(ticket, null, 2));
}

main().finally(() => prisma.$disconnect());
