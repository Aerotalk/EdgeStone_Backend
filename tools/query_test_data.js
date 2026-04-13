const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Scanning for test data ---");

    const clients = await prisma.client.findMany({
        where: {
            OR: [
                { name: { startsWith: 'e2e', mode: 'insensitive' } },
                { name: { contains: 'test', mode: 'insensitive' } }
            ]
        }
    });
    console.log(`Found ${clients.length} test clients.`);
    clients.forEach(c => console.log(` - Client: ${c.name} (${c.id})`));

    const vendors = await prisma.vendor.findMany({
        where: {
            OR: [
                { name: { startsWith: 'e2e', mode: 'insensitive' } },
                { name: { contains: 'test', mode: 'insensitive' } }
            ]
        }
    });
    console.log(`Found ${vendors.length} test vendors.`);
    vendors.forEach(v => console.log(` - Vendor: ${v.name} (${v.id})`));

    const tickets = await prisma.ticket.findMany({
        where: {
            OR: [
                { header: { startsWith: 'e2e', mode: 'insensitive' } },
                { header: { contains: 'test', mode: 'insensitive' } },
                { email: { startsWith: 'e2e', mode: 'insensitive' } },
                { email: { contains: 'test', mode: 'insensitive' } }
            ]
        }
    });
    console.log(`Found ${tickets.length} test tickets.`);
    // don't log all if > 10, just a few
    tickets.slice(0, 10).forEach(t => console.log(` - Ticket: ${t.ticketId} - ${t.header}`));

    if (tickets.length > 10) console.log(`   ... and ${tickets.length - 10} more`);

    // Let's also check tickets linked to these test clients/vendors
    const linkedTickets = await prisma.ticket.findMany({
        where: {
            OR: [
                { clientId: { in: clients.map(c => c.id) } },
                { vendorId: { in: vendors.map(v => v.id) } }
            ]
        }
    });
    console.log(`Found ${linkedTickets.length} tickets linked to test clients/vendors.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
