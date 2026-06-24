const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const slaRecordService = require('./services/slaRecordService');

async function run() {
    const records = await slaRecordService.getAllSLARecords({ search: '#1075' });
    console.log(JSON.stringify(records, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
