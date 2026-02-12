const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();



async function main() {
    console.log('Seeding database...');

    // 1. Create Super Admin
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@edgestone.com' },
        update: {},
        create: {
            name: 'Super Admin',
            email: 'admin@edgestone.com',
            passwordHash,
            status: 'Active',
            createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            access: { dashboard: true, sla: true, vendor: true, superAdmin: true, client: true },
            role: 'Admin'
        },
    });
    console.log('Created Super Admin:', admin.email);

    // 2. Create IT Admin (for tests) - ONLY if requested
    if (process.env.CREATE_TEST_USER === 'true') {
        const itPasswordHash = await bcrypt.hash('i@edgestone123', salt);
        const itAdmin = await prisma.user.upsert({
            where: { email: 'it@edgestone.in' },
            update: {},
            create: {
                name: 'IT Admin',
                email: 'it@edgestone.in',
                passwordHash: itPasswordHash,
                status: 'Active',
                createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                access: { dashboard: true, sla: true, vendor: true, superAdmin: true, client: true },
                role: 'Admin'
            },
        });
        console.log('Created IT Test Admin:', itAdmin.email);
    }



    // 4. Create Vendors (Removed) - Keeping logic clean
    // console.log('Seeded Vendors');

    // 5. Create Mock Ticket (Removed)
    // console.log('Seeded Ticket #3421');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
