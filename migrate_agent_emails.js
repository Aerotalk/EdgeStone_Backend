// Script to migrate existing agents to have their primary email in the emails array
const prisma = require('./models/index');
const logger = require('./utils/logger');

async function migrateAgentEmails() {
    try {
        logger.info('🔄 Starting agent emails migration...');

        // Find all agents
        const agents = await prisma.agent.findMany();
        logger.info(`📊 Found ${agents.length} agents to check`);

        let updatedCount = 0;

        for (const agent of agents) {
            // Check if emails array is empty or doesn't include the primary email
            if (!agent.emails || agent.emails.length === 0 || !agent.emails.includes(agent.email)) {
                const newEmails = agent.emails && agent.emails.length > 0
                    ? [...new Set([agent.email, ...agent.emails])] // Add primary email and remove duplicates
                    : [agent.email]; // Just use primary email

                await prisma.agent.update({
                    where: { id: agent.id },
                    data: { emails: newEmails }
                });

                logger.info(`✅ Updated agent: ${agent.name} (${agent.email})`);
                updatedCount++;
            }
        }

        logger.info(`🎉 Migration complete! Updated ${updatedCount} agents.`);
        process.exit(0);
    } catch (error) {
        logger.error(`❌ Migration failed: ${error.message}`);
        process.exit(1);
    }
}

migrateAgentEmails();
