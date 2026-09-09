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

    const agents = await prisma.agent.deleteMany({
        where: {
            OR: [
                { name: { startsWith: 'E2E ' } },
                { email: { startsWith: 'e2e_' } }
            ]
        }
    });
    console.log(`Deleted ${agents.count} agent records.`);

    const users = await prisma.user.deleteMany({
        where: {
            OR: [
                { name: { startsWith: 'E2E ' } },
                { email: { startsWith: 'e2e_' } }
            ]
        }
    });
    console.log(`Deleted ${users.count} user records.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
