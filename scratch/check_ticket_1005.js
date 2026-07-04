const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const t = await prisma.ticket.findFirst({
    where: { ticketId: '#1005' },
    include: { replies: true }
  });
  console.log('TICKET #1005 REPLIES:', JSON.stringify(t.replies, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
