const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const tickets = await prisma.ticket.findMany({
            select: { id: true, email: true, header: true }
        });
        console.log('--- DB TICKETS (Concise) ---');
        console.log(JSON.stringify(tickets, null, 2));
        console.log('----------------------------');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
