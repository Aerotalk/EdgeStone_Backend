const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addCatchAllRule() {
  const slaId = '055ceeb9-4fee-4e02-9548-04a215847609';
  
  await prisma.slaRule.create({
    data: {
      slaId: slaId,
      upperLimit: 91,
      upperOperator: '>',
      lowerLimit: 0,
      lowerOperator: '>=',
      compensationPercentage: 50
    }
  });
  console.log('Added catch-all rule for < 91%');
}

addCatchAllRule().catch(console.error).finally(() => prisma.$disconnect());
