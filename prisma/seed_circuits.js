const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedCircuitData() {
    console.log('🌱 Seeding Circuit Data...');

    try {
        // 1. Create Clients (Customers)
        console.log('👥 Creating Clients...');

        const bhartiAirtel = await prisma.client.upsert({
            where: { id: 'client-bharti-airtel' },
            update: {},
            create: {
                id: 'client-bharti-airtel',
                name: 'Bharti Airtel (USA)',
                emails: ['airtel.usa@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        const singapore = await prisma.client.upsert({
            where: { id: 'client-singapore' },
            update: {},
            create: {
                id: 'client-singapore',
                name: 'Singapore',
                emails: ['singapore@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        const fptTelecom = await prisma.client.upsert({
            where: { id: 'client-fpt-telecom' },
            update: {},
            create: {
                id: 'client-fpt-telecom',
                name: 'FPT Telecom',
                emails: ['fpt.telecom@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        const mumbaiOne = await prisma.client.upsert({
            where: { id: 'client-mumbai-one' },
            update: {},
            create: {
                id: 'client-mumbai-one',
                name: 'Mumbai/One',
                emails: ['mumbai.one@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        console.log('✅ Created 4 clients');

        // 2. Create Vendors (Suppliers)
        console.log('🏭 Creating Vendors...');

        const chinaUnicom = await prisma.vendor.upsert({
            where: { id: 'vendor-china-unicom' },
            update: {},
            create: {
                id: 'vendor-china-unicom',
                name: 'China Unicom (Singapore)',
                emails: ['china.unicom@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        const convergeict = await prisma.vendor.upsert({
            where: { id: 'vendor-convergeict' },
            update: {},
            create: {
                id: 'vendor-convergeict',
                name: 'ConvergeICT',
                emails: ['convergeict@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        const pccwGlobal = await prisma.vendor.upsert({
            where: { id: 'vendor-pccw-global' },
            update: {},
            create: {
                id: 'vendor-pccw-global',
                name: 'PCCW Global (France Communications Limited)',
                emails: ['pccw.global@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        const brightArise = await prisma.vendor.upsert({
            where: { id: 'vendor-bright-arise' },
            update: {},
            create: {
                id: 'vendor-bright-arise',
                name: 'Bright Arise',
                emails: ['bright.arise@example.com'],
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            }
        });

        console.log('✅ Created 4 vendors');

        // 3. Create Circuits
        console.log('🔌 Creating Circuits...');

        // Circuit 1: BA/SNG-TY2/ESPL-003
        await prisma.circuit.upsert({
            where: { customerCircuitId: 'BA/SNG-TY2/ESPL-003' },
            update: {},
            create: {
                customerCircuitId: 'BA/SNG-TY2/ESPL-003',
                poNumber: null,
                serviceDescription: 'IPLC 10G Japan to SJAC on charter',
                contractTermMonths: 36,
                contractType: 'Lease',

                supplierCircuitId: 'ES-SG2-TY2-WG0101',
                supplierPoNumber: null,
                supplierServiceDescription: 'IPLC 10G Japan to SJAC on charter',
                supplierContractTermMonths: 36,
                supplierContractType: 'Lease',
                billingStartDate: '31-Aug-24',

                clientId: bhartiAirtel.id,
                vendorId: chinaUnicom.id,

                sla: {
                    create: {
                        value: '99.50%'
                    }
                }
            }
        });

        // Circuit 2: BA/SNG-CHK/ESPL-002
        await prisma.circuit.upsert({
            where: { customerCircuitId: 'BA/SNG-CHK/ESPL-002' },
            update: {},
            create: {
                customerCircuitId: 'BA/SNG-CHK/ESPL-002',
                poNumber: null,
                serviceDescription: 'IPLC 10G Japan to SJAC on charter',
                contractTermMonths: 36,
                contractType: 'Lease',

                supplierCircuitId: 'ES-SG2-CHK-HKG001',
                supplierPoNumber: null,
                supplierServiceDescription: 'IPLC 10G Japan to SJAC on charter',
                supplierContractTermMonths: 36,
                supplierContractType: 'Lease',
                billingStartDate: '05-Aug-24',

                clientId: bhartiAirtel.id,
                vendorId: chinaUnicom.id,

                sla: {
                    create: {
                        value: '99.50%'
                    }
                }
            }
        });

        // Circuit 3: BA/CHK-CHK/ESPL-004
        await prisma.circuit.upsert({
            where: { customerCircuitId: 'BA/CHK-CHK/ESPL-004' },
            update: {},
            create: {
                customerCircuitId: 'BA/CHK-CHK/ESPL-004',
                poNumber: null,
                serviceDescription: 'cable',
                contractTermMonths: 12,
                contractType: 'Lease',

                supplierCircuitId: 'IKE2016442',
                supplierPoNumber: null,
                supplierServiceDescription: 'FC',
                supplierContractTermMonths: 12,
                supplierContractType: 'Lease',
                billingStartDate: '12-Aug-24',

                clientId: singapore.id,
                vendorId: convergeict.id,

                sla: {
                    create: {
                        value: '99.50%'
                    }
                }
            }
        });

        // Circuit 4: FPT/T-Sequa/LALA/ESPL-001
        await prisma.circuit.upsert({
            where: { customerCircuitId: 'FPT/T-Sequa/LALA/ESPL-001' },
            update: {},
            create: {
                customerCircuitId: 'FPT/T-Sequa/LALA/ESPL-001',
                poNumber: null,
                serviceDescription: '10G IPLC Equinix LA1 on charter',
                contractTermMonths: 12,
                contractType: 'Lease',

                supplierCircuitId: 'IECDU3011-LALA-EQULA-16982',
                supplierPoNumber: null,
                supplierServiceDescription: '10G IPLC Equinix LA1 on charter',
                supplierContractTermMonths: 12,
                supplierContractType: 'Lease',
                billingStartDate: '5-Oct-24',

                clientId: fptTelecom.id,
                vendorId: pccwGlobal.id,

                sla: {
                    create: {
                        value: '99.75%'
                    }
                }
            }
        });

        // Circuit 5: NIL/CHK-MUM/ESPL-006
        await prisma.circuit.upsert({
            where: { customerCircuitId: 'NIL/CHK-MUM/ESPL-006' },
            update: {},
            create: {
                customerCircuitId: 'NIL/CHK-MUM/ESPL-006',
                poNumber: null,
                serviceDescription: 'IP Protected 2 Mbps LAP',
                contractTermMonths: 36,
                contractType: 'Lease',

                supplierCircuitId: '161975',
                supplierPoNumber: null,
                supplierServiceDescription: 'IPLC (E1G-HNE-WE)',
                supplierContractTermMonths: 36,
                supplierContractType: 'Lease',
                billingStartDate: '30-Dec-24',

                clientId: mumbaiOne.id,
                vendorId: brightArise.id,

                sla: {
                    create: {
                        value: '99.0%'
                    }
                }
            }
        });

        console.log('✅ Created 5 circuits with SLA records');

        console.log('\n📊 Summary:');
        console.log('  - 4 Clients created');
        console.log('  - 4 Vendors created');
        console.log('  - 5 Circuits created');
        console.log('  - 5 SLA records created');
        console.log('\n✅ Circuit data seeding complete!');

    } catch (error) {
        console.error('❌ Error seeding circuit data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedCircuitData();
