const UserModel = require('./models/user');
const prisma = require('./models/index');
const bcrypt = require('bcryptjs');

async function checkPassword() {
    try {
        const email = 'it@edgestone.in';
        const password = 'i@edgestone123';

        console.log(`Checking user: ${email}`);
        const user = await UserModel.findUserByEmail(email);

        if (!user) {
            console.log('User NOT FOUND.');
            return;
        }

        console.log('User FOUND.');
        console.log(`Comparing password '${password}' with hash...`);
        const isMatch = await bcrypt.compare(password, user.passwordHash);

        if (isMatch) {
            console.log('Password MATCHES! Login should succeed.');
        } else {
            console.log('Password DOES NOT MATCH! Login should fail with "Invalid credentials".');
        }

    } catch (error) {
        console.error('Error checking password:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPassword();
