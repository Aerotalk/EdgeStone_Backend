const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const t = await prisma.ticket.findFirst({
    where: { ticketId: '#1024' },
    include: { replies: true }
  });
  console.log(JSON.stringify(t, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
