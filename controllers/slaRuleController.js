const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const prisma = new PrismaClient();

exports.getAllSLARules = async (req, res) => {
    try {
        const rules = await prisma.sLARule.findMany({
            include: {
                conditions: true
            }
        });
        
        res.status(200).json({ success: true, data: rules });
    } catch (error) {
        logger.error('❌ Error fetching SLA rules:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch SLA rules' });
    }
};

exports.createSLARule = async (req, res) => {
    try {
        const { circuitId, circuitDisplayId, targetType, targetId, targetName, conditions } = req.body;
        
        if (!circuitId || !targetType || !targetId || !conditions) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        // Format conditions to fix types
        const formattedConditions = conditions.map(c => ({
            upperLimit: c.upperLimit !== null ? Number(c.upperLimit) : null,
            upperOperator: c.upperOperator,
            lowerLimit: c.lowerLimit !== null ? Number(c.lowerLimit) : null,
            lowerOperator: c.lowerOperator,
            compensation: Number(c.compensation) || 0
        }));

        const newRule = await prisma.sLARule.create({
            data: {
                circuitId,
                circuitDisplayId: circuitDisplayId || circuitId,
                targetType,
                targetId,
                targetName: targetName || targetId,
                conditions: {
                    create: formattedConditions
                }
            },
            include: {
                conditions: true
            }
        });
        
        res.status(201).json({ success: true, data: newRule });
    } catch (error) {
        logger.error('❌ Error creating SLA rule:', error);
        res.status(500).json({ success: false, message: 'Failed to create SLA rule', error: error.message });
    }
};

exports.updateSLARule = async (req, res) => {
    try {
        const { id } = req.params;
        const { conditions } = req.body;
        
        if (!conditions || !Array.isArray(conditions)) {
            return res.status(400).json({ success: false, message: 'Invalid conditions payload' });
        }
        
        // Format conditions to fix types
        const formattedConditions = conditions.map(c => ({
            upperLimit: c.upperLimit !== null ? Number(c.upperLimit) : null,
            upperOperator: c.upperOperator,
            lowerLimit: c.lowerLimit !== null ? Number(c.lowerLimit) : null,
            lowerOperator: c.lowerOperator,
            compensation: Number(c.compensation) || 0
        }));

        // Use a transaction to delete old conditions and create new ones
        const updatedRule = await prisma.$transaction(async (tx) => {
            // Check if rule exists
            const ruleExists = await tx.sLARule.findUnique({ where: { id } });
            if (!ruleExists) {
                throw new Error('SLA rule not found');
            }

            // Remove existing conditions
            await tx.sLARuleCondition.deleteMany({
                where: { ruleId: id }
            });

            // Re-add new conditions
            return tx.sLARule.update({
                where: { id },
                data: {
                    conditions: {
                        create: formattedConditions
                    }
                },
                include: {
                    conditions: true
                }
            });
        });
        
        res.status(200).json({ success: true, data: updatedRule });
    } catch (error) {
        logger.error('❌ Error updating SLA rule:', error);
        if (error.message === 'SLA rule not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Failed to update SLA rule', error: error.message });
    }
};
