const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const replies = await prisma.reply.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { ticket: { select: { ticketId: true, ticketType: true } } }
  });
  console.log('LATEST REPLIES:', JSON.stringify(replies, null, 2));

  const tickets = await prisma.ticket.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('LATEST TICKETS:', JSON.stringify(tickets, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
