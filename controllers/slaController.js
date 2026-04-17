'use strict';

const slaService = require('../services/slaService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────
// GET /api/sla
// ─────────────────────────────────────────────
exports.listSlas = async (req, res, next) => {
    try {
        const slas = await slaService.getAllSlas();
        res.status(200).json({ success: true, count: slas.length, data: slas });
    } catch (err) {
        logger.error('🚨 ⏱️ [SLA] ❌ listSlas error:', err);
        next(err);
    }
};

// ─────────────────────────────────────────────
// GET /api/sla/grouped
// ─────────────────────────────────────────────
exports.getGroupedSlas = async (req, res, next) => {
    try {
        const grouped = await slaService.getGroupedSlas();
        res.status(200).json({ success: true, data: grouped });
    } catch (err) {
        logger.error('🚨 ⏱️ [SLA] ❌ getGroupedSlas error:', err);
        next(err);
    }
};

// ─────────────────────────────────────────────
// GET /api/sla/:id
// ─────────────────────────────────────────────
exports.getSla = async (req, res, next) => {
    try {
        const sla = await slaService.getSlaById(req.params.id);
        res.status(200).json({ success: true, data: sla });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ getSla error [${req.params.id}]:`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// ─────────────────────────────────────────────
// POST /api/sla
// Body: { circuitId, appliesTo, vendorId?, customerId?, rules[] }
// ─────────────────────────────────────────────
exports.createSla = async (req, res, next) => {
    try {
        logger.info(`⏱️ [SLA] 📦 [SLA CONTROLLER] Payload Rcvd ➡️ ${JSON.stringify(req.body)}`);
        const result = await slaService.createSla(req.body);
        logger.info(`⏱️ [SLA] ✅ [SLA CONTROLLER] Successfully Stored SLA ➡️ ID: ${result.id}`);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ [SLA CONTROLLER] Creation Error: ${err.message}`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// ─────────────────────────────────────────────
// PUT /api/sla/:id
// Body: { appliesTo, vendorId?, customerId?, rules[] }
// ─────────────────────────────────────────────
exports.updateSla = async (req, res, next) => {
    try {
        logger.info(`⏱️ [SLA] 📝 [SLA CONTROLLER] Updating SLA ID: ${req.params.id} ➡️ ${JSON.stringify(req.body)}`);
        const result = await slaService.updateSla(req.params.id, req.body);
        logger.info(`⏱️ [SLA] 🔄 [SLA CONTROLLER] Successfully updated SLA ➡️ ID: ${result.id}`);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ [SLA CONTROLLER] Update Error: ${err.message}`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// ─────────────────────────────────────────────
// PATCH /api/sla/:id/status
// Body: { status: "SAFE" | "BREACHED", reason: string }
// ─────────────────────────────────────────────
exports.patchSlaStatus = async (req, res, next) => {
    try {
        const { status, reason } = req.body;
        const sla = await slaService.updateSlaStatus(req.params.id, status, reason);
        res.status(200).json({ success: true, data: sla });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ patchSlaStatus error [${req.params.id}]:`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// ─────────────────────────────────────────────
// POST /api/sla/:id/calculate
// Body: { downtimeMinutes, totalUptimeMinutes }
// Triggers the calculation engine for an SLA event
// ─────────────────────────────────────────────
exports.calculateSla = async (req, res, next) => {
    try {
        const { downtimeMinutes, totalUptimeMinutes } = req.body;

        if (downtimeMinutes === undefined || totalUptimeMinutes === undefined) {
            res.status(400);
            return next(new Error('downtimeMinutes and totalUptimeMinutes are required.'));
        }

        const sla = await slaService.calculateSla(
            req.params.id,
            Number(downtimeMinutes),
            Number(totalUptimeMinutes)
        );

        res.status(200).json({ success: true, data: sla });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ calculateSla error [${req.params.id}]:`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// ─────────────────────────────────────────────
// Dynamic Rule Management
// Each SLA (per circuit + per vendor/customer) owns its own rule list.
// Rules can be added/edited/deleted individually without touching the parent SLA.
// Overlap validation is re-run on every write.
// ─────────────────────────────────────────────

// GET /api/sla/:id/rules
exports.getRules = async (req, res, next) => {
    try {
        const rules = await slaService.getRulesForSla(req.params.id);
        res.status(200).json({ success: true, count: rules.length, data: rules });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ getRules error [sla=${req.params.id}]:`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// POST /api/sla/:id/rules
// Body: { upperLimit?, upperOperator?, lowerLimit?, lowerOperator?, compensationPercentage }
exports.addRule = async (req, res, next) => {
    try {
        logger.info(`⏱️ [SLA] ➕ [SLA CONTROLLER] Adding Rule to SLA ID: ${req.params.id} ➡️ Payload: ${JSON.stringify(req.body)}`);
        const result = await slaService.addRuleToSla(req.params.id, req.body);
        logger.info(`⏱️ [SLA] ✔️ [SLA CONTROLLER] Added Rule ID: ${result.id}`);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ [SLA CONTROLLER] Add Rule Error: ${err.message}`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// PUT /api/sla/:id/rules/:ruleId
// Body: { upperLimit?, upperOperator?, lowerLimit?, lowerOperator?, compensationPercentage }
exports.updateRule = async (req, res, next) => {
    try {
        const rule = await slaService.updateSlaRule(req.params.id, req.params.ruleId, req.body);
        res.status(200).json({ success: true, data: rule });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ updateRule error [sla=${req.params.id}, rule=${req.params.ruleId}]:`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

// DELETE /api/sla/:id/rules/:ruleId
exports.deleteRule = async (req, res, next) => {
    try {
        const result = await slaService.deleteSlaRule(req.params.id, req.params.ruleId);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        logger.error(`🚨 ⏱️ [SLA] ❌ deleteRule error [sla=${req.params.id}, rule=${req.params.ruleId}]:`, err);
        if (err.statusCode) res.status(err.statusCode);
        next(err);
    }
};

