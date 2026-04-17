'use strict';

const express = require('express');
const router  = express.Router();
const { protect, requireSuperAdmin } = require('../middlewares/authMiddleware');
const slaController = require('../controllers/slaController');

router.use(protect);
router.use(requireSuperAdmin);

// ── SLA CRUD ──────────────────────────────────────────────────────────────────

// List all SLAs (with embedded rules)
router.get('/', slaController.listSlas);

// Get SLAs grouped by circuit
router.get('/grouped', slaController.getGroupedSlas);

// Update an entire SLA and its rules
router.put('/:id', slaController.updateSla);

// Create a new SLA with an initial set of dynamic rules
// POST body: { circuitId, appliesTo, vendorId?, customerId?, rules[] }
router.post('/', slaController.createSla);

// SLA details + all rules + full audit log
router.get('/:id', slaController.getSla);

// Manual status override (reason required)
// PATCH body: { status: "SAFE"|"BREACHED", reason }
router.patch('/:id/status', slaController.patchSlaStatus);

// Trigger the calculation engine
// POST body: { downtimeMinutes, totalUptimeMinutes }
router.post('/:id/calculate', slaController.calculateSla);

// ── DYNAMIC RULE MANAGEMENT ───────────────────────────────────────────────────
//
// Every SLA belongs to exactly one (circuit + vendor) or (circuit + customer).
// Rules are fully dynamic — you can add/update/delete individual availability
// tiers at any time without recreating the parent SLA.
// Overlap validation runs on every write.
//
// Rule body shape:
//   { upperLimit?, upperOperator?, lowerLimit?, lowerOperator?, compensationPercentage }
//
// Operator values:
//   upperOperator: "<" | "<="
//   lowerOperator: ">" | ">="
//
// Example rule: 99 > Av >= 95 → 10% of MRC
//   { upperLimit: 99, upperOperator: "<", lowerLimit: 95, lowerOperator: ">=", compensationPercentage: 10 }

// List all rules for an SLA (ordered by lowerLimit asc)
router.get('/:id/rules', slaController.getRules);

// Add a new rule to an existing SLA
router.post('/:id/rules', slaController.addRule);

// Update an individual rule
router.put('/:id/rules/:ruleId', slaController.updateRule);

// Delete a single rule (cannot delete the last one)
router.delete('/:id/rules/:ruleId', slaController.deleteRule);

module.exports = router;

