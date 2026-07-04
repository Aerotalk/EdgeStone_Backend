const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const t = await prisma.ticket.findFirst({
    where: { ticketId: '#1093' },
    include: { replies: true, activityLogs: true }
  });
  console.log('TICKET #1093:', JSON.stringify(t, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
