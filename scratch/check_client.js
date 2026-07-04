const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const c = await prisma.client.findUnique({where: {id: 'c1ba9e6b-b974-4a08-89f6-8f81b33c884c'}});
    console.log(c);
}
run().catch(console.error).finally(() => prisma.$disconnect());
