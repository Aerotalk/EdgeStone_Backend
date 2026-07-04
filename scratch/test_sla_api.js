/**
 * Smoke test for the new SLA Management APIs.
 * Generates a JWT directly via the DB user, bypassing the login endpoint.
 * Run: node test_sla_api.js
 * Requires: backend running on localhost:5000
 */

const jwt  = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const BASE   = 'http://localhost:5000/api';
const prisma = new PrismaClient();
let   TOKEN  = '';

// ── helpers ───────────────────────────────────────────────────────────────────

async function req(method, path, body) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(`${BASE}${path}`, opts);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, data: json };
}

function pass(label, condition, info = '') {
    if (condition) {
        console.log(`  ✅ ${label}${info ? ' — ' + info : ''}`);
    } else {
        console.error(`  ❌ FAIL: ${label}${info ? ' — ' + info : ''}`);
    }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🧪 SLA Management API Smoke Tests\n');

    // 0. Mint a token directly from the DB user
    console.log('Step 0: Mint auth token');
    const user = await prisma.user.findFirst();
    if (user) {
        TOKEN = jwt.sign(
            { id: user.id, role: user.role || 'Agent', isAgent: false },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        pass(`Token minted for ${user.email}`, !!TOKEN);
    } else {
        console.warn('  ⚠️  No user in DB — continuing without auth');
    }

    // 1. GET /circuits
    console.log('\nStep 1: GET /circuits');
    const circuits = await req('GET', '/circuits');
    pass('Status 200', circuits.status === 200, `got ${circuits.status}`);
    const circuitList = circuits.data.data || [];
    pass('Has circuits', circuitList.length > 0, `count=${circuitList.length}`);
    if (circuitList.length) {
        const c = circuitList[0];
        pass('Circuit has type field',    'type'     in c, `type=${c.type}`);
        pass('Circuit has vendorId field', 'vendorId' in c);
    }

    // 2. GET /vendors
    console.log('\nStep 2: GET /vendors');
    const vendors = await req('GET', '/vendors');
    pass('Status 200', vendors.status === 200, `got ${vendors.status}`);
    const vendorList = vendors.data.data || vendors.data || [];
    pass('Has vendors', vendorList.length > 0, `count=${vendorList.length}`);

    // 3. GET /customers (clients)
    console.log('\nStep 3: GET /customers (clients)');
    const customers = await req('GET', '/clients');
    pass('Status 200', customers.status === 200, `got ${customers.status}`);
    const customerList = customers.data.data || customers.data || [];
    pass('Has customers', customerList.length > 0, `count=${customerList.length}`);

    // Find a circuit with a vendorId to test POST /sla
    const circuitWithVendor = circuitList.find(c => c.vendorId);
    if (!circuitWithVendor) {
        console.warn('\n⚠️  No circuit with vendorId found — skipping SLA creation tests');
        await prisma.$disconnect();
        return;
    }

    // Cleanup: delete any SLA from a previous test run so this is idempotent
    await prisma.sla.deleteMany({
        where: { circuitId: circuitWithVendor.id, appliesTo: 'VENDOR', vendorId: circuitWithVendor.vendorId },
    });

    // 4. POST /sla — create vendor SLA with 3 rules
    console.log(`\nStep 4: POST /sla (VENDOR, circuit=${circuitWithVendor.customerCircuitId})`);
    const createResp = await req('POST', '/sla', {
        circuitId: circuitWithVendor.id,
        appliesTo: 'VENDOR',
        vendorId:  circuitWithVendor.vendorId,
        rules: [
            // Rule 1: 99 <= Av <= 100  → 0%  (SLA met) — exclusive upper bound at 100 is fine; open upper = infinity
            { lowerLimit: 99, lowerOperator: '>=', compensationPercentage: 0 },
            // Rule 2: 95 <= Av < 99   → 10% MRC
            { upperLimit: 99, upperOperator: '<', lowerLimit: 95, lowerOperator: '>=', compensationPercentage: 10 },
            // Rule 3: 0 <= Av < 95    → 25% MRC
            { upperLimit: 95, upperOperator: '<', lowerLimit: 0, lowerOperator: '>=', compensationPercentage: 25 },
        ],
    });

    pass('Status 201', createResp.status === 201, `got ${createResp.status}`);
    const sla = createResp.data.data;
    if (!sla) {
        console.error('  ❌ No SLA in response:', JSON.stringify(createResp.data));
        await prisma.$disconnect();
        return;
    }
    pass('SLA id exists',    !!sla.id);
    pass('Rules count = 3',  sla.rules.length === 3, `got ${sla.rules.length}`);
    pass('Status = SAFE',    sla.status === 'SAFE');

    // 5. Duplicate VENDOR SLA → 409
    console.log('\nStep 5: POST /sla duplicate VENDOR → 409');
    const dupResp = await req('POST', '/sla', {
        circuitId: circuitWithVendor.id,
        appliesTo: 'VENDOR',
        vendorId:  circuitWithVendor.vendorId,
        rules: [{ lowerLimit: 99, lowerOperator: '>=', compensationPercentage: 0 }],
    });
    pass('Status 409', dupResp.status === 409, `got ${dupResp.status}`);

    // 6. Overlapping rules → 422
    console.log('\nStep 6: POST /sla overlapping rules → 422');
    const diffVendor = vendorList.find(v => v.id !== circuitWithVendor.vendorId);
    if (diffVendor) {
        const overlapResp = await req('POST', '/sla', {
            circuitId: circuitWithVendor.id,
            appliesTo: 'VENDOR',
            vendorId:  diffVendor.id,
            rules: [
                { lowerLimit: 90, lowerOperator: '>=', upperLimit: 100, upperOperator: '<=', compensationPercentage: 5 },
                { lowerLimit: 95, lowerOperator: '>=', compensationPercentage: 10 }, // overlaps above
            ],
        });
        pass('Status 422', overlapResp.status === 422, `got ${overlapResp.status}`);
    } else {
        console.log('  ⚠️  Skipped (no other vendor available)');
    }

    // 7. GET /sla
    console.log('\nStep 7: GET /sla');
    const listResp = await req('GET', '/sla');
    pass('Status 200', listResp.status === 200, `got ${listResp.status}`);
    pass('List includes created SLA', (listResp.data.data || []).some(s => s.id === sla.id));

    // 8. GET /sla/:id
    console.log(`\nStep 8: GET /sla/${sla.id}`);
    const getResp = await req('GET', `/sla/${sla.id}`);
    pass('Status 200',       getResp.status === 200);
    pass('Rules embedded',   getResp.data.data?.rules?.length === 3);
    pass('Audit log exists', Array.isArray(getResp.data.data?.auditLogs));

    // 9. POST /sla/:id/calculate — 120 min downtime in 30-day period (expected availability ≈ 99.72%)
    console.log(`\nStep 9: POST /sla/${sla.id}/calculate`);
    const calcResp = await req('POST', `/sla/${sla.id}/calculate`, {
        downtimeMinutes:    120,
        totalUptimeMinutes: 43200, // 30 days = 43200 minutes
    });
    pass('Status 200', calcResp.status === 200, `got ${calcResp.status}`);
    const calcSla = calcResp.data.data;
    if (calcSla) {
        const avail = calcSla.availabilityFactor;
        pass('Availability calculated', avail !== null, `${avail?.toFixed(4)}%`);
        pass('Downtime = 120',          calcSla.totalDowntimeMinutes === 120);
        // 120 min downtime / 43200 min → 99.722% avail → rule >= 99 → SAFE
        pass('Status = SAFE (99.72% > 99%)', calcSla.status === 'SAFE', `status=${calcSla.status}`);
    }

    // 10. POST /sla/:id/calculate — massive downtime → BREACHED
    console.log(`\nStep 10: POST /sla/${sla.id}/calculate (heavy downtime)`);
    const calcResp2 = await req('POST', `/sla/${sla.id}/calculate`, {
        downtimeMinutes:    3000,  // adds 3000 more minutes (total = 3120)
        totalUptimeMinutes: 43200,
    });
    pass('Status 200', calcResp2.status === 200, `got ${calcResp2.status}`);
    if (calcResp2.data.data) {
        const avail2 = calcResp2.data.data.availabilityFactor;
        // 3120 downtime / 43200 → 92.78% availability → rule <95% → 25% compensation → BREACHED
        pass('Status = BREACHED (92.78% < 95%)', calcResp2.data.data.status === 'BREACHED',
             `status=${calcResp2.data.data.status}, avail=${avail2?.toFixed(2)}%`);
        pass('Compensation = 25', calcResp2.data.data.compensationAmount === 25,
             `got ${calcResp2.data.data.compensationAmount}`);
        pass('Audit log written', calcResp2.data.data.auditLogs?.length > 0,
             `${calcResp2.data.data.auditLogs?.length} entries`);
    }

    // 11. PATCH /sla/:id/status — manual override
    console.log(`\nStep 11: PATCH /sla/${sla.id}/status → SAFE`);
    const patchResp = await req('PATCH', `/sla/${sla.id}/status`, {
        status: 'SAFE',
        reason: 'Maintenance window resolved — manual override by IT team',
    });
    pass('Status 200',      patchResp.status === 200, `got ${patchResp.status}`);
    pass('Status = SAFE',   patchResp.data.data?.status === 'SAFE');
    pass('Audit log grows', patchResp.data.data?.auditLogs?.length > 1,
         `${patchResp.data.data?.auditLogs?.length} entries`);

    // 12. PATCH without reason → 400
    console.log(`\nStep 12: PATCH without reason → 400`);
    const noReasonResp = await req('PATCH', `/sla/${sla.id}/status`, { status: 'BREACHED' });
    pass('Status 400', noReasonResp.status === 400, `got ${noReasonResp.status}`);

    console.log('\n🎉 All tests complete.\n');
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('💥 Fatal:', e);
    await prisma.$disconnect();
    process.exit(1);
});
