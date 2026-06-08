const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
  const records = await prisma.sLARecord.findMany({
    include: { ticket: { select: { ticketId: true, circuitId: true } } },
    where: { ticket: { circuitId: 'N1/PARO/2611' } }
  });
  console.log(JSON.stringify(records, null, 2));
}

checkDb().catch(console.error).finally(() => prisma.$disconnect());
