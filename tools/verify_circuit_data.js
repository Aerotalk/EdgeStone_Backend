const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyData() {
    console.log('🔍 Verifying seeded data...\n');

    try {
        const clients = await prisma.client.findMany();
        console.log(`✅ Clients: ${clients.length}`);
        clients.forEach(c => console.log(`   - ${c.name}`));

        const vendors = await prisma.vendor.findMany();
        console.log(`\n✅ Vendors: ${vendors.length}`);
        vendors.forEach(v => console.log(`   - ${v.name}`));

        const circuits = await prisma.circuit.findMany({
            include: {
                client: true,
                vendor: true,
                sla: true
            }
        });
        console.log(`\n✅ Circuits: ${circuits.length}`);
        circuits.forEach(c => {
            console.log(`\n   Circuit: ${c.customerCircuitId}`);
            console.log(`   Customer: ${c.client?.name || 'N/A'}`);
            console.log(`   Supplier: ${c.vendor?.name || 'N/A'}`);
            console.log(`   SLA: ${c.sla?.value || 'N/A'}`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyData();
