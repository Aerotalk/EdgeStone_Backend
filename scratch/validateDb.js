const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const slas = await prisma.sla.findMany({ include: { rules: true } });
        console.log("All SLAs in DB:", JSON.stringify(slas, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
run();
