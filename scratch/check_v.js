const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const v1028 = await prisma.ticket.findFirst({ where: { ticketId: '#V1028' } });
  const v1029 = await prisma.ticket.findFirst({ where: { ticketId: '#V1029' } });
  console.log('V1028:', JSON.stringify(v1028, null, 2));
  console.log('V1029:', JSON.stringify(v1029, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
