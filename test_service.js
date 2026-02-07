const ticketService = require('./services/ticketService');
const prisma = require('./models/index');

async function testTicketService() {
    try {
        console.log('Testing ticketService.getTickets...');
        const tickets = await ticketService.getTickets();
        console.log(`Tickets retrieved: ${tickets.length}`);
        console.log('ticketService.getTickets passed.');
    } catch (error) {
        console.error('ticketService test failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testTicketService();
