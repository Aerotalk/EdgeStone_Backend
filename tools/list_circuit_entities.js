const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const circuits = await prisma.circuit.findMany({
        include: {
            client: true,
            vendor: true
        }
    });

    console.log("| Customer Circuit ID | Supplier Circuit ID | Client Name | Vendor Name |");
    console.log("|---|---|---|---|");
    circuits.forEach(c => {
        const cId = c.customerCircuitId || 'N/A';
        const sId = c.supplierCircuitId || 'N/A';
        const clientName = c.client ? c.client.name : 'None';
        const vendorName = c.vendor ? c.vendor.name : 'None';
        console.log(`| ${cId} | ${sId} | ${clientName} | ${vendorName} |`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
