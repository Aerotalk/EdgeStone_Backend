const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const latestTickets = await prisma.ticket.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('LATEST TICKETS:');
  console.log(JSON.stringify(latestTickets, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
