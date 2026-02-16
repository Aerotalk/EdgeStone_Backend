const CircuitModel = require('../models/circuit');
const logger = require('../utils/logger');

const getCircuits = async (req, res, next) => {
    try {
        logger.debug('📝 Request received: getCircuits');

        const circuits = await CircuitModel.findAllCircuits();

        // Return only necessary fields for dropdown
        const circuitOptions = circuits.map(circuit => ({
            id: circuit.id,
            customerCircuitId: circuit.customerCircuitId,
            supplierCircuitId: circuit.supplierCircuitId,
            // Include client name if available for better UX
            clientId: circuit.clientId
        }));

        logger.info(`✅ Successfully fetched ${circuitOptions.length} circuits`);
        res.json(circuitOptions);
    } catch (error) {
        logger.error(`❌ Error fetching circuits: ${error.message}`, { stack: error.stack });
        next(error);
    }
};

module.exports = {
    getCircuits
};
