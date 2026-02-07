const UserModel = require('./models/user');
const prisma = require('./models/index');

async function checkUser() {
    try {
        const email = 'it@edgestone.in';
        console.log(`Checking for user: ${email}`);
        const user = await UserModel.findUserByEmail(email);

        if (user) {
            console.log('User FOUND:', user);
            console.log(`ID: ${user.id}`);
            console.log(`Role: ${user.role}`);
            console.log(`Password Hash starts with: ${user.passwordHash ? user.passwordHash.substring(0, 10) : 'NO HASH'}`);
        } else {
            console.log('User NOT FOUND in database.');
        }

    } catch (error) {
        console.error('Error checking user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUser();
