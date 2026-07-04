const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning up E2E records...');
    
    const clients = await prisma.client.deleteMany({
        where: { name: { startsWith: 'E2E ' } }
    });
    console.log(`Deleted ${clients.count} client records.`);

    const vendors = await prisma.vendor.deleteMany({
        where: { name: { startsWith: 'E2E ' } }
    });
    console.log(`Deleted ${vendors.count} vendor records.`);

    const agents = await prisma.user.deleteMany({
        where: { name: { startsWith: 'E2E ' } }
    });
    console.log(`Deleted ${agents.count} agent records.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
