const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const circuit = await prisma.circuit.findFirst({where: {customerCircuitId: 'N1/SG1-MUM/ESPL-007'}});
    console.log('Circuit:', circuit);
    if (circuit) {
        const client = await prisma.client.findUnique({where: {id: circuit.clientId}});
        console.log('Client:', client);
        const vendor = await prisma.vendor.findUnique({where: {id: circuit.vendorId}});
        console.log('Vendor:', vendor);
    }
}
run().catch(console.error).finally(() => prisma.$disconnect());
