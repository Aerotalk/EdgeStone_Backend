const prisma = require('./utils/prisma');

async function checkUser() {
    try {
        const email = 'it@edgestone.in';
        console.log(`Checking user: ${email}`);
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (user) {
            console.log('User found:');
            console.log('ID:', user.id);
            console.log('Email:', user.email);
            console.log('Role:', user.role);
            console.log('Access:', user.access);
            console.log('PasswordHash:', user.passwordHash);
            console.log('Is Hashed:', user.passwordHash.startsWith('$'));
        } else {
            console.log('User NOT found.');
            // List all emails to see if there's a typo
            const allUsers = await prisma.user.findMany({ select: { email: true } });
            console.log('Available emails:', allUsers.map(u => u.email));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkUser();
