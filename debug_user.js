const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'admin@edgestone.com'; // Assuming this is the user
    console.log(`Fetching user with email: ${email}`);

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (user) {
        console.log('User found:');
        console.log('Access Field:', JSON.stringify(user.access, null, 2));
        console.log('Role Field:', user.role);
    } else {
        console.log('User not found in User table.');
    }

    const agent = await prisma.agent.findUnique({
        where: { email },
    });

    if (agent) {
        console.log('Agent found:');
        console.log(JSON.stringify(agent, null, 2));
    } else {
        console.log('Agent not found in Agent table.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
