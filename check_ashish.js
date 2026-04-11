const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tickets = await prisma.ticket.findMany({
    where: { 
      OR: [
        { email: { contains: 'ashish' } },
        { header: { contains: 'Test' } }
      ]
    }
  });
  console.log('TICKETS with ashish/Test:', JSON.stringify(tickets, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
