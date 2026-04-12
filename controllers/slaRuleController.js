const slaRuleService = require('../services/slaRuleService');
const logger = require('../utils/logger');

exports.getAllSLARules = async (req, res) => {
    try {
        const rules = await slaRuleService.getAllSLARules();
        res.status(200).json({ success: true, data: rules });
    } catch (error) {
        logger.error('❌ Error fetching SLA rules:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch SLA rules' });
    }
};

exports.createSLARule = async (req, res) => {
    try {
        const newRule = await slaRuleService.createSLARule(req.body);
        res.status(201).json({ success: true, data: newRule });
    } catch (error) {
        logger.error('❌ Error creating SLA rule:', error);
        if (error.message === 'Missing required fields') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Failed to create SLA rule', error: error.message });
    }
};

exports.updateSLARule = async (req, res) => {
    try {
        const { id } = req.params;
        const { conditions } = req.body;
        
        const updatedRule = await slaRuleService.updateSLARule(id, conditions);
        res.status(200).json({ success: true, data: updatedRule });
    } catch (error) {
        logger.error('❌ Error updating SLA rule:', error);
        if (error.message === 'SLA rule not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message === 'Invalid conditions payload') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Failed to update SLA rule', error: error.message });
    }
};
