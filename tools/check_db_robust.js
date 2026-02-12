const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    try {
        const tickets = await prisma.ticket.findMany({
            select: { id: true, email: true, header: true }
        });
        const output = JSON.stringify(tickets, null, 2);
        fs.writeFileSync('db_tickets.json', output);
        console.log('Tickets written to db_tickets.json');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
