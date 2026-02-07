const prisma = require('./utils/prisma');
const bcrypt = require('bcryptjs');

async function fixPassword() {
    try {
        const email = 'it@edgestone.in';
        const password = 'i@edgestone123';

        console.log(`Hashing password for: ${email}`);

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const updatedUser = await prisma.user.update({
            where: { email },
            data: { passwordHash }
        });

        console.log('Password updated successfully for user:', updatedUser.email);
    } catch (e) {
        console.error('Error updating password:', e);
    } finally {
        await prisma.$disconnect();
    }
}

fixPassword();
