'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

const getCircuits = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: getCircuits');

        const circuits = await prisma.circuit.findMany({
            include: {
                vendor: { select: { id: true, name: true, status: true } },
                client: { select: { id: true, name: true, status: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const circuitOptions = circuits.map(circuit => ({
            id:                circuit.id,
            type:              circuit.type,              // PROTECTED | UNPROTECTED
            customerCircuitId: circuit.customerCircuitId,
            supplierCircuitId: circuit.supplierCircuitId,
            clientId:          circuit.clientId,
            vendorId:          circuit.vendorId,
            vendor:            circuit.vendor,
            client:            circuit.client,
        }));

        logger.info(`✅ Successfully fetched ${circuitOptions.length} circuits`);
        res.status(200).json({ success: true, data: circuitOptions });
    } catch (error) {
        logger.error(`❌ Error fetching circuits: ${error.message}`, { stack: error.stack });
        next(error);
    }
};

module.exports = { getCircuits };

