const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
    const slas = await prisma.sla.findMany({ 
        include: { circuit: { select: { customerCircuitId: true } }, rules: true } 
    });
    if (!slas.length) { 
        console.log('NO SLA RULES CONFIGURED AT ALL'); 
        await prisma.$disconnect();
        return; 
    }
    slas.forEach(s => {
        console.log('Circuit:', s.circuit?.customerCircuitId, '| appliesTo:', s.appliesTo, '| rules:', s.rules.length, '| totalDowntime:', s.totalDowntimeMinutes + 'm', '| availability:', s.availabilityFactor + '%', '| status:', s.status, '| compensation:', s.compensationAmount + '%');
        s.rules.forEach((r, i) => {
            console.log('  Rule', i+1, '| upper:', r.upperOperator, r.upperLimit, '| lower:', r.lowerOperator, r.lowerLimit, '| compensation:', r.compensationPercentage + '%');
        });
    });
    await prisma.$disconnect();
}
check().catch(e => { console.error(e.message); process.exit(1); });
