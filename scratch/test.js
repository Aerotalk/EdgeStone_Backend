const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany();
  const vendors = await prisma.vendor.findMany();
  
  const clientMatch = clients.filter(c => c.emails.includes('priyanshurouth@gmail.com'));
  const vendorMatch = vendors.filter(v => v.emails.includes('priyanshurouth@gmail.com'));
  
  console.log('Client match:', clientMatch);
  console.log('Vendor match:', vendorMatch);
}

main().finally(() => prisma.$disconnect());
