const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
  const sla = await prisma.sla.findFirst({
    include: { rules: true },
    where: { circuit: { customerCircuitId: 'N1/PARO/2611' } }
  });
  console.log(JSON.stringify(sla, null, 2));
}

checkDb().catch(console.error).finally(() => prisma.$disconnect());
