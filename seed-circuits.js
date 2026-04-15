/**
 * seed-circuits.js
 * Script to seed the database with Clients, Vendors, Circuits and SLAs from the provided Excel sheet.
 * Assumes Prisma Client is available in @prisma/client mapped from the backend.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const data = [
    {
        customerCircuitId: 'BA/SNG-TY2/ESPL-003',
        clientName: 'Bharti Airtel (USA)',
        serviceDescription: '100G SG-Japan on ASE cable',
        contractTermMonths: 36,
        contractType: 'Lease',
        supplierName: 'MarvelTec',
        supplierCircuitId: 'ES-SGP-TYO-1000/001',
        supplierServiceDescription: '100G SG-Japan on ASE cable',
        supplierContractTermMonths: 36,
        supplierContractType: 'lease',
        billingStartDate: '31-May-24',
        sla: '99.50%'
    },
    {
        customerCircuitId: 'BA/SNG-CHK/ESPL-002',
        clientName: 'Bharti Airtel (USA)',
        serviceDescription: '100G SG-Japan on SJC cable',
        contractTermMonths: 36,
        contractType: 'Lease',
        supplierName: 'China Unicom (Singapore) Limited',
        supplierCircuitId: 'SNG/CU-CHK/CUNP001',
        supplierServiceDescription: '100G SG-Japan on SJC cable',
        supplierContractTermMonths: 36,
        supplierContractType: 'lease',
        billingStartDate: '5-Apr-24',
        sla: '99.50%'
    },
    {
        customerCircuitId: 'BA/SNG-CHK/ESPL-004',
        clientName: 'Bharti Airtel Singapore',
        serviceDescription: '100G SG-Japan on C2C cable',
        contractTermMonths: 12,
        contractType: 'Lease',
        supplierName: 'ConvergeICT',
        supplierCircuitId: 'MC038842',
        supplierServiceDescription: '100G SG-Chikura on C2C',
        supplierContractTermMonths: 12,
        supplierContractType: 'lease',
        billingStartDate: '12-Aug-24',
        sla: '99.50%'
    },
    {
        customerCircuitId: 'FPT/TY2-EquinixLA1/ESPL-005',
        clientName: 'FPT Telecom',
        serviceDescription: '100G TY2-Equinix LA1 on Jupiter',
        contractTermMonths: 12,
        contractType: 'Lease',
        supplierName: 'PCCW (Gateway Global Communications Limited)',
        supplierCircuitId: 'EDG018.0001.EL.02 / EDG018-149098-ELW',
        supplierServiceDescription: '100G TY2- Equinix LA1 on Jupiter',
        supplierContractTermMonths: 12,
        supplierContractType: 'lease',
        billingStartDate: '5-Oct-24',
        sla: '99.75%'
    },
    {
        customerCircuitId: 'N1/LON-MUM/ESPL-006',
        clientName: 'Neutrality One',
        serviceDescription: '1G Protected L2 MUM-LD',
        contractTermMonths: 36,
        contractType: 'Lease',
        supplierName: 'Bharti Airtel',
        supplierCircuitId: '14819758',
        supplierServiceDescription: '1G Protected L2 MUM-PRDC (EIG+IMEWE)',
        supplierContractTermMonths: 36,
        supplierContractType: 'lease',
        billingStartDate: '30-Dec-24',
        sla: '99.9%'
    }
];

async function main() {
    console.log('Starting execution...');
    for (const row of data) {
        // 1. Find or create Client
        console.log(`Processing client: ${row.clientName}`);
        let client = await prisma.client.findFirst({
            where: { name: row.clientName }
        });

        if (!client) {
            client = await prisma.client.create({
                data: {
                    name: row.clientName,
                    emails: [],
                    status: 'Active',
                    createdOn: new Date().toLocaleDateString('en-GB')
                }
            });
            console.log(`Created new client: ${client.name}`);
        } else {
            console.log(`Found existing client: ${client.name}`);
        }

        // 2. Find or create Vendor (Supplier)
        console.log(`Processing vendor: ${row.supplierName}`);
        let vendor = await prisma.vendor.findFirst({
            where: { name: row.supplierName }
        });

        if (!vendor) {
            vendor = await prisma.vendor.create({
                data: {
                    name: row.supplierName,
                    emails: [],
                    status: 'Active',
                    createdOn: new Date().toLocaleDateString('en-GB')
                }
            });
            console.log(`Created new vendor: ${vendor.name}`);
        } else {
            console.log(`Found existing vendor: ${vendor.name}`);
        }

        // 3. Upsert Circuit
        console.log(`Processing circuit: ${row.customerCircuitId}`);
        const circuit = await prisma.circuit.upsert({
            where: { customerCircuitId: row.customerCircuitId },
            update: {
                poNumber: null,
                serviceDescription: row.serviceDescription,
                contractTermMonths: row.contractTermMonths,
                contractType: row.contractType,
                supplierCircuitId: row.supplierCircuitId,
                supplierPoNumber: null,
                supplierServiceDescription: row.supplierServiceDescription,
                supplierContractTermMonths: row.supplierContractTermMonths,
                supplierContractType: row.supplierContractType,
                billingStartDate: row.billingStartDate,
                clientId: client.id,
                vendorId: vendor.id,
                mrc: Math.floor(Math.random() * 1000) + 1000,
                supplierMrc: Math.floor(Math.random() * 800) + 500
            },
            create: {
                customerCircuitId: row.customerCircuitId,
                poNumber: null,
                serviceDescription: row.serviceDescription,
                contractTermMonths: row.contractTermMonths,
                contractType: row.contractType,
                supplierCircuitId: row.supplierCircuitId,
                supplierPoNumber: null,
                supplierServiceDescription: row.supplierServiceDescription,
                supplierContractTermMonths: row.supplierContractTermMonths,
                supplierContractType: row.supplierContractType,
                billingStartDate: row.billingStartDate,
                clientId: client.id,
                vendorId: vendor.id,
                mrc: Math.floor(Math.random() * 1000) + 1000,
                supplierMrc: Math.floor(Math.random() * 800) + 500
            }
        });
        console.log(`Upserted circuit: ${circuit.customerCircuitId}`);

        // 4. Upsert SLA
        console.log(`Processing SLA for circuit: ${row.customerCircuitId}`);
        await prisma.circuitSLAValue.upsert({
            where: { circuitId: circuit.id },
            update: {
                value: String(row.sla).endsWith('%') ? String(row.sla) : String(row.sla) + '%'
            },
            create: {
                circuitId: circuit.id,
                value: String(row.sla).endsWith('%') ? String(row.sla) : String(row.sla) + '%'
            }
        });
        console.log(`Upserted SLA value: ${row.sla}`);
    }
    console.log('Seeding completed successfully!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
