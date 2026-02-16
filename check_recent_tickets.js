const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecentTickets() {
    try {
        const tickets = await prisma.ticket.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                ticketId: true,
                header: true,
                email: true,
                createdAt: true
            }
        });

        console.log('\n=== RECENT TICKETS ===');
        console.log(JSON.stringify(tickets, null, 2));
        console.log(`\nTotal tickets shown: ${tickets.length}`);

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

checkRecentTickets();
