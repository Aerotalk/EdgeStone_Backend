const prisma = require('../models/index');

async function find() { 
  console.log('Client:', await prisma.client.findFirst({where:{name:'EdgeStone Marketing'}})); 
  console.log('Vendor:', await prisma.vendor.findFirst({where:{name:'EdgeStone Marketing'}})); 
} 

find().finally(() => prisma.$disconnect());
