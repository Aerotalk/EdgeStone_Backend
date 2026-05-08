const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const tickets = await prisma.ticket.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log("Recent Tickets:");
    tickets.forEach(t => {
        console.log(`- Header: ${t.header}, CircuitID: ${t.circuitId}`);
    });
}
check().finally(() => prisma.$disconnect());
