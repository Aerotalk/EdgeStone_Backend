const prisma = require('../models/index');

async function checkDb() {
  const clients = await prisma.client.findMany({ where: { emails: { has: 'marketing@edgestone.in' } } });
  const vendors = await prisma.vendor.findMany({ where: { emails: { has: 'marketing@edgestone.in' } } });
  
  console.log('Clients:', clients.length > 0 ? clients : 'None');
  console.log('Vendors:', vendors.length > 0 ? vendors : 'None');
}

checkDb().finally(() => prisma.$disconnect());
