const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const circuits = [
    {
        // Sr. No. 1
        customerDetails: {
            circuitId: 'BA/SNG-TY2/ESPL-003',
            name: 'Bharti Airtel (USA)',
            serviceDesc: '100G SG-Japan on ASE cable',
            contractTerm: 36,
            contractType: 'Lease'
        },
        supplierDetails: {
            name: 'MarvelTec',
            circuitId: 'ES-SGP-TYO-100G/001',
            serviceDesc: '100G SG-Japan on ASE cable',
            contractTerm: 36,
            contractType: 'lease',
            billingStartDate: '31-May-24'
        },
        sla: '99.50%'
    },
    {
        // Sr. No. 2
        customerDetails: {
            circuitId: 'BA/SNG-CHK/ESPL-002',
            name: 'Bharti Airtel (USA)',
            serviceDesc: '100G SG-Japan on SJC cable',
            contractTerm: 36,
            contractType: 'Lease'
        },
        supplierDetails: {
            name: 'China Unicom (Singapore) Limited',
            circuitId: 'SNB/CU-CHK/CU NP001',
            serviceDesc: '100G SG-Japan on SJC cable',
            contractTerm: 36,
            contractType: 'lease',
            billingStartDate: '5-Apr-24'
        },
        sla: '99.50%'
    },
    {
        // Sr. No. 3
        customerDetails: {
            circuitId: 'BA/SNG-CHK/ESPL-004',
            name: 'Bharti Airtel Singapore',
            serviceDesc: '100G SG-Japan on C2C cable',
            contractTerm: 12,
            contractType: 'Lease'
        },
        supplierDetails: {
            name: 'ConvergeICT',
            circuitId: 'MC038542',
            serviceDesc: '100G SG-Chikura on C2C',
            contractTerm: 12,
            contractType: 'lease',
            billingStartDate: '12-Aug-24'
        },
        sla: '99.50%'
    },
    {
        // Sr. No. 4
        customerDetails: {
            circuitId: 'FPT/TY2-Equinix LA1/ESPL-005',
            name: 'FPT Telecom',
            serviceDesc: '100G TY2 - Equinix LA1 on Jupiter',
            contractTerm: 12,
            contractType: 'Lease'
        },
        supplierDetails: {
            name: 'PCCW (Gateway Global Communications Limited)',
            circuitId: 'EDG018.0001.EL.02 / EDG018-148085-ELW',
            serviceDesc: '100G TY2 - Equinix LA1 on Jupiter',
            contractTerm: 12,
            contractType: 'lease',
            billingStartDate: '5-Oct-24'
        },
        sla: '99.75%'
    },
    {
        // Sr. No. 5
        customerDetails: {
            circuitId: 'N1/LON-MUM/ESPL-006',
            name: 'Neutrality One',
            serviceDesc: '1G Protected L2 MUM-PRDC (EIG+IMEWE)',
            contractTerm: 36,
            contractType: 'Lease'
        },
        supplierDetails: {
            name: 'Bharti Airtel',
            circuitId: '14819758',
            serviceDesc: '1G Protected L2 MUM-PRDC (EIG+IMEWE)',
            contractTerm: 36,
            contractType: 'lease',
            billingStartDate: '30-Dec-24'
        },
        sla: '99.9%'
    }
];

async function seed() {
    console.log('🌱 Seeding Circuits (Refactored)...');

    for (const data of circuits) {
        try {
            // 1. Upsert Client (was Customer)
            let client = await prisma.client.findFirst({
                where: { name: data.customerDetails.name }
            });

            if (!client) {
                client = await prisma.client.create({
                    data: {
                        name: data.customerDetails.name,
                        emails: [], // Default empty array as we don't have email in image
                        createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        status: 'Active'
                    }
                });
                console.log(`Created Client: ${client.name}`);
            }

            // 2. Upsert Vendor (was Supplier)
            let vendor = await prisma.vendor.findFirst({
                where: { name: data.supplierDetails.name }
            });

            if (!vendor) {
                vendor = await prisma.vendor.create({
                    data: {
                        name: data.supplierDetails.name,
                        emails: [],
                        createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        status: 'Active'
                    }
                });
                console.log(`Created Vendor: ${vendor.name}`);
            }

            // 3. Upsert Circuit
            // Check if circuit exists by ID first to determine if we update or create
            // Actually upsert is cleaner
            const circuit = await prisma.circuit.upsert({
                where: { customerCircuitId: data.customerDetails.circuitId },
                update: {
                    serviceDescription: data.customerDetails.serviceDesc,
                    contractTermMonths: data.customerDetails.contractTerm,
                    contractType: data.customerDetails.contractType,

                    supplierCircuitId: data.supplierDetails.circuitId,
                    supplierServiceDescription: data.supplierDetails.serviceDesc,
                    supplierContractTermMonths: data.supplierDetails.contractTerm,
                    supplierContractType: data.supplierDetails.contractType,
                    billingStartDate: data.supplierDetails.billingStartDate,

                    clientId: client.id,
                    vendorId: vendor.id,
                },
                create: {
                    customerCircuitId: data.customerDetails.circuitId,
                    serviceDescription: data.customerDetails.serviceDesc,
                    contractTermMonths: data.customerDetails.contractTerm,
                    contractType: data.customerDetails.contractType,

                    supplierCircuitId: data.supplierDetails.circuitId,
                    supplierServiceDescription: data.supplierDetails.serviceDesc,
                    supplierContractTermMonths: data.supplierDetails.contractTerm,
                    supplierContractType: data.supplierDetails.contractType,
                    billingStartDate: data.supplierDetails.billingStartDate,

                    clientId: client.id,
                    vendorId: vendor.id,
                }
            });

            console.log(`Upserted Circuit: ${circuit.customerCircuitId}`);

            // 4. Upsert SLA
            const existingSLA = await prisma.sLA.findUnique({
                where: { circuitId: circuit.id }
            });

            if (existingSLA) {
                await prisma.sLA.update({
                    where: { id: existingSLA.id },
                    data: { value: data.sla }
                });
            } else {
                await prisma.sLA.create({
                    data: {
                        value: data.sla,
                        circuitId: circuit.id
                    }
                });
            }
            console.log(`Updated SLA for: ${circuit.customerCircuitId}`);

        } catch (error) {
            console.error(`❌ Error processing ${data.customerDetails.circuitId}:`);
            console.error('Message:', error.message);
            console.error('Code:', error.code);
            console.error('Meta:', error.meta);
        }
    }

    console.log('✅ Seeding completed.');
}

seed()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
