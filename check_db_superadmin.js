const prisma = require('./utils/prisma');

async function checkSuperAdmin() {
    try {
        console.log('Searching for Superadmin users...');
        const users = await prisma.user.findMany();

        const superAdmins = users.filter(u => u.access && u.access.superAdmin === true);

        if (superAdmins.length > 0) {
            console.log('FOUND Superadmins:');
            superAdmins.forEach(u => {
                console.log(`- Name: ${u.name}, Email: ${u.email}, Access:`, u.access);
            });
        } else {
            console.log('NO Superadmin users found in the database.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkSuperAdmin();
