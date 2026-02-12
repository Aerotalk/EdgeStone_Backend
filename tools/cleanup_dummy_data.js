const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupDummyData() {
    console.log('🧹 Cleaning up dummy/test data...\n');

    try {
        // Delete all replies (will cascade if needed)
        const deletedReplies = await prisma.reply.deleteMany({});
        console.log(`✅ Deleted ${deletedReplies.count} replies`);

        // Delete all tickets
        const deletedTickets = await prisma.ticket.deleteMany({});
        console.log(`✅ Deleted ${deletedTickets.count} tickets`);

        // Delete all SLA records
        const deletedSLA = await prisma.sLARecord.deleteMany({});
        console.log(`✅ Deleted ${deletedSLA.count} SLA records`);

        console.log('\n✅ Cleanup complete! Database is now clean.');
        console.log('📧 Ready to receive real emails and create tickets.');

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

cleanupDummyData();
