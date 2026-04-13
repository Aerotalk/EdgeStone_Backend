const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const rules = await prisma.sLARule.findMany({ include: { conditions: true } });
    console.log('SLA Rules in DB:', rules);
  } catch (err) {
    console.error('Error fetching SLA rules:', err);
  }
}

main().finally(() => prisma.$disconnect());
