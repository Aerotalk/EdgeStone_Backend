const prisma = require('../models/index');

async function check() {
  const circuit = await prisma.circuit.findFirst({
    where: { customerCircuitId: 'BA/SNG-TY2/ESPL-003' },
    include: { vendor: true }
  });
  console.log('Circuit Vendor:', circuit?.vendor?.name);
  console.log('Vendor Emails:', circuit?.vendor?.emails);
}
check().finally(() => prisma.$disconnect());
