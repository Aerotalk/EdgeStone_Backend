const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const prisma = new PrismaClient();

const getAllSLARules = async () => {
    return await prisma.sLARule.findMany({
        include: {
            conditions: true
        }
    });
};

const createSLARule = async (ruleData) => {
    const { circuitId, circuitDisplayId, targetType, targetId, targetName, conditions } = ruleData;

    if (!circuitId || !targetType || !targetId || !conditions) {
        throw new Error('Missing required fields');
    }

    // Format conditions to fix types
    const formattedConditions = conditions.map(c => ({
        upperLimit: c.upperLimit !== null ? Number(c.upperLimit) : null,
        upperOperator: c.upperOperator,
        lowerLimit: c.lowerLimit !== null ? Number(c.lowerLimit) : null,
        lowerOperator: c.lowerOperator,
        compensation: Number(c.compensation) || 0
    }));

    return await prisma.sLARule.create({
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
};

const updateSLARule = async (id, conditions) => {
    if (!conditions || !Array.isArray(conditions)) {
        throw new Error('Invalid conditions payload');
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
    return await prisma.$transaction(async (tx) => {
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
};

module.exports = {
    getAllSLARules,
    createSLARule,
    updateSLARule
};
