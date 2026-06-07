const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting SLA Seeding...');

    const slaData = [
        {
            customerCircuitId: 'BA/SNG-CHK/ESPL-002',
            appliesTo: 'CLIENT', // Assuming these are customer-facing SLAs for compensation
            rules: [
                // Assuming it's a "Non-Protected Service" by default if not otherwise specified, 
                // or we can seed the Non-Protected matrix.
                { upperLimit: null, upperOperator: null, lowerLimit: 99.5, lowerOperator: '>=', compensationPercentage: 0 },
                { upperLimit: 99.5, upperOperator: '<', lowerLimit: 99.4, lowerOperator: '>=', compensationPercentage: 5 },
                { upperLimit: 99.4, upperOperator: '<', lowerLimit: 99.3, lowerOperator: '>=', compensationPercentage: 10 },
                { upperLimit: 99.3, upperOperator: '<', lowerLimit: 99.2, lowerOperator: '>=', compensationPercentage: 15 },
                { upperLimit: 99.2, upperOperator: '<', lowerLimit: 99.0, lowerOperator: '>=', compensationPercentage: 20 },
                { upperLimit: 99.0, upperOperator: '<', lowerLimit: null, lowerOperator: null, compensationPercentage: 30 },
            ]
        },
        {
            customerCircuitId: 'BA/SNG-TY2/ESPL-003',
            appliesTo: 'CLIENT',
            rules: [
                { upperLimit: null, upperOperator: null, lowerLimit: 99.50, lowerOperator: '>=', compensationPercentage: 0 },
                { upperLimit: 99.50, upperOperator: '<', lowerLimit: 99.40, lowerOperator: '>=', compensationPercentage: 2 },
                { upperLimit: 99.40, upperOperator: '<', lowerLimit: null, lowerOperator: null, compensationPercentage: 4 },
            ]
        },
        {
            customerCircuitId: 'BA/SNG-CHK/ESPL-004',
            appliesTo: 'CLIENT',
            rules: [
                // No compensation matrix, but a 99.7% target. 
                // We add a single dummy rule so the engine evaluates availability.
                { upperLimit: null, upperOperator: null, lowerLimit: 0, lowerOperator: '>=', compensationPercentage: 0 }
            ]
        },
        {
            customerCircuitId: 'BA/SG-MUM/ESPL-008',
            appliesTo: 'CLIENT',
            // Using Protected Service matrix
            rules: [
                { upperLimit: null, upperOperator: null, lowerLimit: 99.90, lowerOperator: '>=', compensationPercentage: 0 },
                { upperLimit: 99.90, upperOperator: '<', lowerLimit: 99.20, lowerOperator: '>=', compensationPercentage: 2 },
                { upperLimit: 99.20, upperOperator: '<', lowerLimit: 98.50, lowerOperator: '>=', compensationPercentage: 4 },
                { upperLimit: 98.50, upperOperator: '<', lowerLimit: 97.00, lowerOperator: '>=', compensationPercentage: 8 },
                { upperLimit: 97.00, upperOperator: '<', lowerLimit: 95.00, lowerOperator: '>=', compensationPercentage: 10 },
                { upperLimit: 95.00, upperOperator: '<', lowerLimit: null, lowerOperator: null, compensationPercentage: 15 },
            ]
        }
    ];

    for (const data of slaData) {
        const circuit = await prisma.circuit.findFirst({
            where: { customerCircuitId: data.customerCircuitId }
        });

        if (!circuit) {
            console.log(`⚠️ Circuit ${data.customerCircuitId} not found in DB. Skipping SLA seed for it.`);
            continue;
        }

        // Check if SLA already exists for this circuit
        const existingSla = await prisma.sla.findFirst({
            where: { circuitId: circuit.id, appliesTo: data.appliesTo }
        });

        if (existingSla) {
            console.log(`ℹ️ SLA already exists for ${data.customerCircuitId}. Skipping.`);
            continue;
        }

        console.log(`🌱 Seeding SLA for ${data.customerCircuitId}...`);
        
        await prisma.sla.create({
            data: {
                circuitId: circuit.id,
                appliesTo: data.appliesTo,
                customerId: circuit.clientId, // Link to the circuit's client
                rules: {
                    create: data.rules
                }
            }
        });
        console.log(`✅ Seeded SLA for ${data.customerCircuitId}`);
    }

    console.log('🎉 SLA Seeding Complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
