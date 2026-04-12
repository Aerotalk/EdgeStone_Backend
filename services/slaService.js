'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Evaluate a single operator comparison.
 * @param {string} operator  "<" | "<=" | ">" | ">="
 * @param {number} value     availability percentage
 * @param {number} limit     threshold from rule
 */
function evalOperator(operator, value, limit) {
    switch (operator) {
        case '>':  return value > limit;
        case '>=': return value >= limit;
        case '<':  return value < limit;
        case '<=': return value <= limit;
        default:   return false;
    }
}

/**
 * Check whether an availability value satisfies a given rule.
 * Rule semantics: upperLimit upperOperator Av lowerOperator lowerLimit
 * Example: 99 > Av >= 95
 * A null limit means that side is unbounded (open boundary).
 */
function ruleMatches(rule, availability) {
    const upperOk =
        rule.upperLimit === null || rule.upperOperator === null
            ? true
            : evalOperator(rule.upperOperator, availability, rule.upperLimit);

    const lowerOk =
        rule.lowerLimit === null || rule.lowerOperator === null
            ? true
            : evalOperator(rule.lowerOperator, availability, rule.lowerLimit);

    return upperOk && lowerOk;
}

/**
 * Convert a rule to an effective [lower, upper] interval for overlap detection.
 * Exclusive bounds are "nudged" inward by EPS so they become pseudo-inclusive,
 * allowing a simple <= comparison to detect true overlaps.
 *
 * Example:
 *   { lowerOperator: '>=', lowerLimit: 95, upperOperator: '<', upperLimit: 99 }
 *   → interval [95, 98.999999999]
 *
 *   { lowerOperator: '>=', lowerLimit: 99 }  (open upper)
 *   → interval [99, +Infinity]
 *
 * These two intervals touch at 99 — but [98.999..., 99] do NOT overlap, so no false positive.
 */
const EPS = 1e-9;
function ruleToInterval(rule) {
    let lower = rule.lowerLimit ?? -Infinity;
    let upper = rule.upperLimit ??  Infinity;

    // Move exclusive bounds inward so border-touching is not an overlap
    if (rule.lowerOperator === '>') lower += EPS;
    if (rule.upperOperator === '<') upper -= EPS;

    return { lower, upper };
}

/**
 * Validate that no two rules in the array cover the same availability point.
 * Two intervals [a.lower, a.upper] and [b.lower, b.upper] overlap iff
 *   a.lower <= b.upper  AND  b.lower <= a.upper
 * (strict <=, no epsilon padding on the comparison itself)
 */
function findOverlappingRules(rules) {
    for (let i = 0; i < rules.length; i++) {
        const a = ruleToInterval(rules[i]);
        for (let j = i + 1; j < rules.length; j++) {
            const b = ruleToInterval(rules[j]);
            if (a.lower <= b.upper && b.lower <= a.upper) {
                return { ruleA: i + 1, ruleB: j + 1 };
            }
        }
    }
    return null;
}


/** Build the Prisma include block used across multiple queries. */
const SLA_INCLUDE = {
    circuit: { select: { id: true, customerCircuitId: true, supplierCircuitId: true, type: true } },
    vendor:  { select: { id: true, name: true, status: true } },
    customer: { select: { id: true, name: true, status: true } },
    rules: { orderBy: { lowerLimit: 'asc' } },
    auditLogs: { orderBy: { timestamp: 'desc' } },
};

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

/**
 * Create a new SLA with its dynamic rule set.
 *
 * Body shape:
 * {
 *   circuitId,
 *   appliesTo,        // "VENDOR" | "CUSTOMER"
 *   vendorId?,        // required when appliesTo=VENDOR
 *   customerId?,      // required when appliesTo=CUSTOMER
 *   rules: [
 *     { upperLimit?, upperOperator?, lowerLimit?, lowerOperator?, compensationPercentage }
 *   ]
 * }
 */
async function createSla(data) {
    const { circuitId, appliesTo, vendorId, customerId, rules = [] } = data;

    // ── Basic validation ──────────────────────────────────────────────
    if (!circuitId || !appliesTo) {
        const err = new Error('circuitId and appliesTo are required.');
        err.statusCode = 400;
        throw err;
    }

    if (!['VENDOR', 'CUSTOMER'].includes(appliesTo)) {
        const err = new Error('appliesTo must be VENDOR or CUSTOMER.');
        err.statusCode = 400;
        throw err;
    }

    if (appliesTo === 'VENDOR' && !vendorId) {
        const err = new Error('vendorId is required when appliesTo is VENDOR.');
        err.statusCode = 400;
        throw err;
    }

    if (appliesTo === 'CUSTOMER' && !customerId) {
        const err = new Error('customerId is required when appliesTo is CUSTOMER.');
        err.statusCode = 400;
        throw err;
    }

    if (!rules.length) {
        const err = new Error('At least one SLA rule is required.');
        err.statusCode = 400;
        throw err;
    }

    // ── One vendor SLA per circuit constraint ─────────────────────────
    if (appliesTo === 'VENDOR') {
        const existing = await prisma.sla.findFirst({
            where: { circuitId, appliesTo: 'VENDOR', vendorId },
        });
        if (existing) {
            const err = new Error(
                `A VENDOR SLA for this circuit and vendor already exists (id: ${existing.id}).`
            );
            err.statusCode = 409;
            throw err;
        }
    }

    // ── One customer SLA per circuit+customer constraint ──────────────
    if (appliesTo === 'CUSTOMER') {
        const existing = await prisma.sla.findFirst({
            where: { circuitId, appliesTo: 'CUSTOMER', customerId },
        });
        if (existing) {
            const err = new Error(
                `A CUSTOMER SLA for this circuit and customer already exists (id: ${existing.id}).`
            );
            err.statusCode = 409;
            throw err;
        }
    }

    // ── Validate rule completeness ────────────────────────────────────
    const formattedRules = rules.map((r, idx) => {
        const hasUpper = r.upperLimit !== null && r.upperLimit !== undefined;
        const hasLower = r.lowerLimit !== null && r.lowerLimit !== undefined;

        if (!hasUpper && !hasLower) {
            const err = new Error(
                `Rule ${idx + 1}: at least one of upperLimit or lowerLimit must be set.`
            );
            err.statusCode = 400;
            throw err;
        }

        if (hasUpper && !r.upperOperator) {
            const err = new Error(`Rule ${idx + 1}: upperOperator is required when upperLimit is set.`);
            err.statusCode = 400;
            throw err;
        }

        if (hasLower && !r.lowerOperator) {
            const err = new Error(`Rule ${idx + 1}: lowerOperator is required when lowerLimit is set.`);
            err.statusCode = 400;
            throw err;
        }

        if (!['<', '<='].includes(r.upperOperator) && hasUpper) {
            const err = new Error(`Rule ${idx + 1}: upperOperator must be "<" or "<=".`);
            err.statusCode = 400;
            throw err;
        }

        if (!['>', '>='].includes(r.lowerOperator) && hasLower) {
            const err = new Error(`Rule ${idx + 1}: lowerOperator must be ">" or ">=".`);
            err.statusCode = 400;
            throw err;
        }

        return {
            upperLimit:    hasUpper ? Number(r.upperLimit) : null,
            upperOperator: hasUpper ? r.upperOperator : null,
            lowerLimit:    hasLower ? Number(r.lowerLimit) : null,
            lowerOperator: hasLower ? r.lowerOperator : null,
            compensationPercentage: Number(r.compensationPercentage) || 0,
        };
    });

    // ── Overlap detection ─────────────────────────────────────────────
    const overlap = findOverlappingRules(formattedRules);
    if (overlap) {
        const err = new Error(
            `Rules ${overlap.ruleA} and ${overlap.ruleB} have overlapping availability ranges.`
        );
        err.statusCode = 422;
        throw err;
    }

    // ── Transactional create ──────────────────────────────────────────
    const sla = await prisma.$transaction(async (tx) => {
        return tx.sla.create({
            data: {
                circuitId,
                appliesTo,
                vendorId:   appliesTo === 'VENDOR'   ? vendorId   : null,
                customerId: appliesTo === 'CUSTOMER' ? customerId : null,
                rules: { create: formattedRules },
            },
            include: SLA_INCLUDE,
        });
    });

    logger.info(`✅ SLA created: ${sla.id} (${appliesTo}) for circuit ${circuitId}`);
    return sla;
}

/** Return all SLAs with embedded rules. */
async function getAllSlas() {
    return prisma.sla.findMany({
        include: SLA_INCLUDE,
        orderBy: { createdAt: 'desc' },
    });
}

/** Return a single SLA with full details, rules, and audit log. */
async function getSlaById(id) {
    const sla = await prisma.sla.findUnique({ where: { id }, include: SLA_INCLUDE });
    if (!sla) {
        const err = new Error(`SLA not found: ${id}`);
        err.statusCode = 404;
        throw err;
    }
    return sla;
}

/**
 * Update the status of an SLA manually (agent override).
 * Writes an audit log row.
 * @param {string} id
 * @param {string} newStatus  "SAFE" | "BREACHED"
 * @param {string} reason     required
 */
async function updateSlaStatus(id, newStatus, reason) {
    if (!['SAFE', 'BREACHED'].includes(newStatus)) {
        const err = new Error('status must be SAFE or BREACHED.');
        err.statusCode = 400;
        throw err;
    }
    if (!reason || !reason.trim()) {
        const err = new Error('reason is required for a status update.');
        err.statusCode = 400;
        throw err;
    }

    const sla = await prisma.sla.findUnique({ where: { id } });
    if (!sla) {
        const err = new Error(`SLA not found: ${id}`);
        err.statusCode = 404;
        throw err;
    }

    const updated = await prisma.$transaction(async (tx) => {
        await tx.sla.update({
            where: { id },
            data: { status: newStatus, statusReason: reason.trim() },
        });

        await tx.slaAuditLog.create({
            data: {
                slaId:     id,
                oldStatus: sla.status,
                newStatus,
                reason:    reason.trim(),
            },
        });
    });

    // Fetch fresh after transaction commits so response includes the new audit row
    const result = await prisma.sla.findUnique({ where: { id }, include: SLA_INCLUDE });

    logger.info(`🔄 SLA ${id} status: ${sla.status} → ${newStatus}. Reason: ${reason.trim()}`);
    return result;

}

// ─────────────────────────────────────────────
// Calculation Engine
// ─────────────────────────────────────────────

/**
 * Run the SLA calculation engine for a given SLA.
 *
 * Algorithm:
 *  1. availability = ((totalUptime - downtimeMinutes) / totalUptime) * 100
 *  2. Match availability against the SLA's dynamic rules
 *  3. Assign compensationAmount from matched rule
 *  4. Determine status: BREACHED if compensationPercentage > 0, else SAFE
 *  5. Persist updated values + write audit log if status changed
 *
 * @param {string} slaId
 * @param {number} downtimeMinutes     new downtime to add (delta, not cumulative)
 * @param {number} totalUptimeMinutes  total contractual uptime for the period (e.g. 43800 = 30 days)
 * @returns {object}  updated SLA record
 */
async function calculateSla(slaId, downtimeMinutes, totalUptimeMinutes) {
    if (downtimeMinutes < 0 || totalUptimeMinutes <= 0) {
        const err = new Error('downtimeMinutes must be >= 0 and totalUptimeMinutes must be > 0.');
        err.statusCode = 400;
        throw err;
    }

    const sla = await prisma.sla.findUnique({
        where:   { id: slaId },
        include: { rules: { orderBy: { lowerLimit: 'asc' } } },
    });

    if (!sla) {
        const err = new Error(`SLA not found: ${slaId}`);
        err.statusCode = 404;
        throw err;
    }

    // ── 1. Accumulate downtime ────────────────────────────────────────
    const newTotalDowntime = sla.totalDowntimeMinutes + downtimeMinutes;

    // ── 2. Availability factor ────────────────────────────────────────
    const effectiveUptime = Math.max(totalUptimeMinutes - newTotalDowntime, 0);
    const availability = (effectiveUptime / totalUptimeMinutes) * 100;

    // ── 3. Match rule ─────────────────────────────────────────────────
    const matchedRule = sla.rules.find((r) => ruleMatches(r, availability)) || null;

    // ── 4. Assign compensation ────────────────────────────────────────
    const compensationPct = matchedRule ? matchedRule.compensationPercentage : 0;

    // ── 5. Determine status ───────────────────────────────────────────
    const newStatus = compensationPct > 0 ? 'BREACHED' : 'SAFE';

    logger.info(
        `📊 SLA ${slaId}: downtime=${newTotalDowntime}m, availability=${availability.toFixed(4)}%, ` +
        `matched rule=${matchedRule?.id ?? 'none'}, compensation=${compensationPct}%, status=${newStatus}`
    );

    // ── 6. Persist + audit ────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
        await tx.sla.update({
            where: { id: slaId },
            data: {
                totalDowntimeMinutes: newTotalDowntime,
                availabilityFactor:   parseFloat(availability.toFixed(6)),
                compensationAmount:   compensationPct,
                status:               newStatus,
                statusReason: matchedRule
                    ? `Matched rule: ${matchedRule.lowerLimit ?? '∞'}–${matchedRule.upperLimit ?? '∞'}% `
                      + `→ ${compensationPct}% compensation`
                    : 'No rule matched; availability within acceptable range.',
            },
        });

        // Write audit log only when status actually changes
        if (newStatus !== sla.status) {
            await tx.slaAuditLog.create({
                data: {
                    slaId,
                    oldStatus: sla.status,
                    newStatus,
                    reason: `Auto-calculated: availability ${availability.toFixed(2)}%`,
                },
            });
        }
    });

    // Fetch fresh after transaction commits so response includes the new audit row
    const updated = await prisma.sla.findUnique({ where: { id: slaId }, include: SLA_INCLUDE });
    return updated;
}

// ─────────────────────────────────────────────
// Per-Rule Dynamic Management
// ─────────────────────────────────────────────

/**
 * Shared rule field validator + formatter.
 * Returns a formatted rule object ready for Prisma, or throws a 400 error.
 */
function validateAndFormatRule(r, idx = 1) {
    const hasUpper = r.upperLimit !== null && r.upperLimit !== undefined;
    const hasLower = r.lowerLimit !== null && r.lowerLimit !== undefined;

    if (!hasUpper && !hasLower) {
        const err = new Error(`Rule ${idx}: at least one of upperLimit or lowerLimit must be set.`);
        err.statusCode = 400;
        throw err;
    }
    if (hasUpper && !r.upperOperator) {
        const err = new Error(`Rule ${idx}: upperOperator is required when upperLimit is set.`);
        err.statusCode = 400;
        throw err;
    }
    if (hasLower && !r.lowerOperator) {
        const err = new Error(`Rule ${idx}: lowerOperator is required when lowerLimit is set.`);
        err.statusCode = 400;
        throw err;
    }
    if (hasUpper && !['<', '<='].includes(r.upperOperator)) {
        const err = new Error(`Rule ${idx}: upperOperator must be "<" or "<=".`);
        err.statusCode = 400;
        throw err;
    }
    if (hasLower && !['>', '>='].includes(r.lowerOperator)) {
        const err = new Error(`Rule ${idx}: lowerOperator must be ">" or ">=".`);
        err.statusCode = 400;
        throw err;
    }
    return {
        upperLimit:            hasUpper ? Number(r.upperLimit)    : null,
        upperOperator:         hasUpper ? r.upperOperator          : null,
        lowerLimit:            hasLower ? Number(r.lowerLimit)    : null,
        lowerOperator:         hasLower ? r.lowerOperator          : null,
        compensationPercentage: Number(r.compensationPercentage) || 0,
    };
}

/**
 * Check the new/edited rule candidate against all sibling rules (excluding `excludeId` if editing).
 * Throws 422 if any overlap is found.
 */
async function assertNoOverlapWithSiblings(slaId, candidateRule, excludeRuleId = null) {
    const siblings = await prisma.slaRule.findMany({
        where: {
            slaId,
            ...(excludeRuleId ? { id: { not: excludeRuleId } } : {}),
        },
    });

    const candidateInterval = ruleToInterval(candidateRule);

    for (const sibling of siblings) {
        const siblingInterval = ruleToInterval(sibling);
        if (
            candidateInterval.lower <= siblingInterval.upper &&
            siblingInterval.lower  <= candidateInterval.upper
        ) {
            const err = new Error(
                `The new rule overlaps with existing rule id=${sibling.id} ` +
                `(range: ${sibling.lowerLimit ?? '−∞'} – ${sibling.upperLimit ?? '+∞'}).`
            );
            err.statusCode = 422;
            throw err;
        }
    }
}

// ── GET /api/sla/:id/rules ───────────────────────────────────────────────────

/**
 * Return all rules for a given SLA, ordered by lowerLimit ascending.
 * SLA is also verified to exist (404 if not).
 */
async function getRulesForSla(slaId) {
    const sla = await prisma.sla.findUnique({ where: { id: slaId } });
    if (!sla) {
        const err = new Error(`SLA not found: ${slaId}`);
        err.statusCode = 404;
        throw err;
    }
    return prisma.slaRule.findMany({
        where:   { slaId },
        orderBy: { lowerLimit: 'asc' },
    });
}

// ── POST /api/sla/:id/rules ──────────────────────────────────────────────────

/**
 * Add a single new rule to an existing SLA.
 *
 * Body: { upperLimit?, upperOperator?, lowerLimit?, lowerOperator?, compensationPercentage }
 *
 * Validates overlap against current sibling rules before inserting.
 * Circuit/vendor context is implicit — the SLA already belongs to a specific
 * circuit+vendor/customer combination.
 */
async function addRuleToSla(slaId, ruleData) {
    const sla = await prisma.sla.findUnique({ where: { id: slaId } });
    if (!sla) {
        const err = new Error(`SLA not found: ${slaId}`);
        err.statusCode = 404;
        throw err;
    }

    const formatted = validateAndFormatRule(ruleData);

    // Check overlap against all existing rules for this SLA
    await assertNoOverlapWithSiblings(slaId, formatted);

    const newRule = await prisma.slaRule.create({
        data: { slaId, ...formatted },
    });

    logger.info(`➕ Rule added to SLA ${slaId}: id=${newRule.id}, compensation=${newRule.compensationPercentage}%`);
    return newRule;
}

// ── PUT /api/sla/:id/rules/:ruleId ──────────────────────────────────────────

/**
 * Update an individual rule in-place.
 *
 * Body: { upperLimit?, upperOperator?, lowerLimit?, lowerOperator?, compensationPercentage }
 *
 * Re-validates overlap against siblings (excluding itself).
 * Useful for adjusting thresholds or compensation % without rebuilding the entire SLA.
 */
async function updateSlaRule(slaId, ruleId, ruleData) {
    const rule = await prisma.slaRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.slaId !== slaId) {
        const err = new Error(`Rule not found: ${ruleId} on SLA ${slaId}`);
        err.statusCode = 404;
        throw err;
    }

    const formatted = validateAndFormatRule(ruleData);

    // Check overlap against siblings, excluding the current rule being edited
    await assertNoOverlapWithSiblings(slaId, formatted, ruleId);

    const updated = await prisma.slaRule.update({
        where: { id: ruleId },
        data:  formatted,
    });

    logger.info(`✏️  Rule ${ruleId} updated on SLA ${slaId}: compensation=${updated.compensationPercentage}%`);
    return updated;
}

// ── DELETE /api/sla/:id/rules/:ruleId ───────────────────────────────────────

/**
 * Remove a single rule from an SLA.
 * The SLA itself remains intact — only this tier is removed.
 * Guards against deleting the last rule (would leave the SLA with no evaluation logic).
 */
async function deleteSlaRule(slaId, ruleId) {
    const rule = await prisma.slaRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.slaId !== slaId) {
        const err = new Error(`Rule not found: ${ruleId} on SLA ${slaId}`);
        err.statusCode = 404;
        throw err;
    }

    // Guard: disallow deleting the last rule
    const count = await prisma.slaRule.count({ where: { slaId } });
    if (count <= 1) {
        const err = new Error(
            'Cannot delete the last rule. An SLA must have at least one rule. ' +
            'Delete the SLA itself if no rules are needed.'
        );
        err.statusCode = 422;
        throw err;
    }

    await prisma.slaRule.delete({ where: { id: ruleId } });
    logger.info(`🗑️  Rule ${ruleId} removed from SLA ${slaId}`);
    return { deleted: true, id: ruleId };
}

module.exports = {
    createSla,
    getAllSlas,
    getSlaById,
    updateSlaStatus,
    calculateSla,
    // Per-rule dynamic management
    getRulesForSla,
    addRuleToSla,
    updateSlaRule,
    deleteSlaRule,
};

