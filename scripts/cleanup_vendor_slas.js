const prisma = require('../models/index');

async function cleanupVendorSlas() {
    console.log('🧹 [MIGRATION] Starting cleanup of SLA records on Vendor (#V) tickets...');

    // 1. Find all SLA records linked to #V or Vendor tickets
    const vendorSlaRecords = await prisma.sLARecord.findMany({
        where: {
            ticket: {
                OR: [
                    { ticketId: { startsWith: '#V' } },
                    { ticketType: 'Vendor' }
                ]
            }
        },
        include: {
            ticket: {
                select: { id: true, ticketId: true, ticketType: true }
            }
        }
    });

    console.log(`🔍 Found ${vendorSlaRecords.length} SLA records attached to Vendor (#V) tickets.`);

    if (vendorSlaRecords.length > 0) {
        const idsToDelete = vendorSlaRecords.map(r => r.id);
        const deleteResult = await prisma.sLARecord.deleteMany({
            where: { id: { in: idsToDelete } }
        });
        console.log(`✅ Successfully deleted ${deleteResult.count} errant SLA records on Vendor tickets.`);
    }

    // 2. Set isSlaActive = false on all #V and Vendor tickets
    const updateResult = await prisma.ticket.updateMany({
        where: {
            OR: [
                { ticketId: { startsWith: '#V' } },
                { ticketType: 'Vendor' }
            ]
        },
        data: {
            isSlaActive: false
        }
    });

    console.log(`✅ Updated ${updateResult.count} Vendor (#V) tickets to isSlaActive: false.`);
    console.log('✨ [MIGRATION] Vendor SLA cleanup completed successfully.');
}

if (require.main === module) {
    cleanupVendorSlas()
        .then(() => prisma.$disconnect())
        .catch(err => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
}

module.exports = cleanupVendorSlas;
