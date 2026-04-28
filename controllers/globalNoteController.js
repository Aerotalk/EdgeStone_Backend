const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

// Get the global note
const getGlobalNote = async (req, res, next) => {
    try {
        let note = await prisma.globalNote.findUnique({
            where: { id: 'global-note' }
        });

        // Create if it doesn't exist
        if (!note) {
            note = await prisma.globalNote.create({
                data: {
                    id: 'global-note',
                    content: '',
                    updatedBy: 'System'
                }
            });
        }

        res.json(note);
    } catch (error) {
        logger.error(`🚨 📝 [GLOBAL NOTE] ❌ Error fetching note: ${error.message}`);
        next(error);
    }
};

// Update the global note
const updateGlobalNote = async (req, res, next) => {
    try {
        const { content } = req.body;
        const agentName = req.user ? req.user.name : 'Unknown Agent';

        const updatedNote = await prisma.globalNote.upsert({
            where: { id: 'global-note' },
            update: {
                content,
                updatedBy: agentName
            },
            create: {
                id: 'global-note',
                content,
                updatedBy: agentName
            }
        });

        logger.info(`📝 [GLOBAL NOTE] ✅ Note updated by ${agentName}`);
        res.json(updatedNote);
    } catch (error) {
        logger.error(`🚨 📝 [GLOBAL NOTE] ❌ Error updating note: ${error.message}`);
        next(error);
    }
};

module.exports = {
    getGlobalNote,
    updateGlobalNote
};
