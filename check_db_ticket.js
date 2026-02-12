const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatestTicket() {
    try {
        console.log('Connecting to database...');

        const latestTicket = await prisma.ticket.findFirst({
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!latestTicket) {
            console.log('No tickets found in database.');
            return;
        }

        console.log('--- Latest Ticket from DB ---');
        console.log('ID:', latestTicket.id);
        console.log('TicketID:', latestTicket.ticketId);
        console.log('Data (Date string):', latestTicket.date);
        console.log('Received At (ISO):', latestTicket.receivedAt);
        console.log('Received Time (String):', latestTicket.receivedTime);
        console.log('Created At:', latestTicket.createdAt);

    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkLatestTicket();
