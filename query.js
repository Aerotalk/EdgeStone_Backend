const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const clients = await prisma.client.findMany();
    console.log('Clients with email priyanshurouth@gmail.com:');
    console.log(clients.filter(c => c.emails.includes('priyanshurouth@gmail.com')));

    const vendors = await prisma.vendor.findMany();
    console.log('Vendors with email priyanshurouth@gmail.com:');
    console.log(vendors.filter(v => v.emails.includes('priyanshurouth@gmail.com')));

    const circuits = await prisma.circuit.findMany({
        where: {
            OR: [
                { customerCircuitId: { contains: 'Paro', mode: 'insensitive' } },
                { supplierCircuitId: { contains: 'Paro', mode: 'insensitive' } }
            ]
        }
    });
    console.log('Circuits containing Paro:', circuits);
}

main().finally(() => prisma.$disconnect());
