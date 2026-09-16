'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');
const { requireManagerOrSuperAdmin } = require('../middlewares/authMiddleware');

// Import routes
const ticketRoutes = require('../routes/ticketRoutes');
const circuitRoutes = require('../routes/circuitRoutes');
const clientRoutes = require('../routes/clientRoutes');
const vendorRoutes = require('../routes/vendorRoutes');
const signatureRoutes = require('../routes/signatureRoutes');

async function runTests() {
    console.log('================================================================');
    console.log('🧪 RUNNING DELETE ROLE PERMISSIONS VERIFICATION SUITE');
    console.log('================================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`  ✅ PASS: ${message}`);
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Part 1: Unit testing requireManagerOrSuperAdmin middleware
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- 1. Testing requireManagerOrSuperAdmin Middleware Logic ---');

    const testMiddleware = (userObj) => {
        let statusCode = 200;
        let errResult = null;
        let nextCalled = false;

        const req = { user: userObj };
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => data
        };
        const next = (err) => {
            nextCalled = true;
            errResult = err;
        };

        requireManagerOrSuperAdmin(req, res, next);
        return { statusCode, errResult, nextCalled };
    };

    // Test 1: Unauthenticated (no user) -> 401
    {
        const res = testMiddleware(null);
        assert(res.statusCode === 401 && res.errResult !== null, 'Unauthenticated user rejected with 401');
    }

    // Test 2: Support crew (standard agent) -> 403 Forbidden
    {
        const res = testMiddleware({ email: 'support@edgestone.in', role: 'Support crew', isSuperAdmin: false });
        assert(res.statusCode === 403 && res.errResult && res.errResult.message.includes('Only Manager and Super Admin'), 'Support crew agent blocked with 403');
    }

    // Test 3: General user / client / vendor role -> 403 Forbidden
    {
        const res = testMiddleware({ email: 'client@company.com', role: 'User', isSuperAdmin: false });
        assert(res.statusCode === 403 && res.errResult !== null, 'Standard user blocked with 403');
    }

    // Test 4: Manager (capitalized) -> Allowed (200, no err)
    {
        const res = testMiddleware({ email: 'manager@edgestone.in', role: 'Manager', isSuperAdmin: false });
        assert(res.statusCode === 200 && !res.errResult && res.nextCalled, 'Manager role allowed');
    }

    // Test 5: Manager (lowercase) -> Allowed
    {
        const res = testMiddleware({ email: 'manager2@edgestone.in', role: 'manager', isSuperAdmin: false });
        assert(res.statusCode === 200 && !res.errResult && res.nextCalled, 'manager (lowercase) allowed');
    }

    // Test 6: Super admin (capitalized) -> Allowed
    {
        const res = testMiddleware({ email: 'admin@edgestone.in', role: 'Super admin', isSuperAdmin: false });
        assert(res.statusCode === 200 && !res.errResult && res.nextCalled, 'Super admin role allowed');
    }

    // Test 7: Superadmin (single word) -> Allowed
    {
        const res = testMiddleware({ email: 'admin2@edgestone.in', role: 'Superadmin', isSuperAdmin: false });
        assert(res.statusCode === 200 && !res.errResult && res.nextCalled, 'Superadmin role allowed');
    }

    // Test 8: isSuperAdmin flag true -> Allowed
    {
        const res = testMiddleware({ email: 'admin3@edgestone.in', role: 'Support crew', isSuperAdmin: true });
        assert(res.statusCode === 200 && !res.errResult && res.nextCalled, 'User with isSuperAdmin: true allowed');
    }

    // Test 9: user.access.superAdmin flag true -> Allowed
    {
        const res = testMiddleware({ email: 'admin4@edgestone.in', role: 'User', access: { superAdmin: true } });
        assert(res.statusCode === 200 && !res.errResult && res.nextCalled, 'User with access.superAdmin: true allowed');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Part 2: Express App & Route Integration Tests
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Express Route Protection on DELETE Endpoints ---');

    // Create a mock Express test app
    const app = express();
    app.use(express.json());

    // Mount routes
    app.use('/api/tickets', ticketRoutes);
    app.use('/api/circuits', circuitRoutes);
    app.use('/api/clients', clientRoutes);
    app.use('/api/vendors', vendorRoutes);
    app.use('/api/signatures', signatureRoutes);

    // Standard error handler for Express tests
    app.use((err, req, res, next) => {
        const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
        res.status(statusCode).json({ error: err.message });
    });

    const jwtSecret = process.env.JWT_SECRET || 'test_secret_for_local_testing_key_123';

    // Mock token generator
    const makeToken = (payload) => jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

    // Mock users
    const supportUser = { id: 'support-agent-123', email: 'support@edgestone.in', role: 'Support crew', isAgent: true, isSuperAdmin: false };
    const managerUser = { id: 'manager-agent-456', email: 'manager@edgestone.in', role: 'Manager', isAgent: true, isSuperAdmin: false };
    const adminUser   = { id: 'admin-agent-789', email: 'admin@edgestone.in', role: 'Super admin', isAgent: true, isSuperAdmin: true };

    const supportToken = makeToken({ id: supportUser.id, role: supportUser.role, isAgent: true });
    const managerToken = makeToken({ id: managerUser.id, role: managerUser.role, isAgent: true });
    const adminToken   = makeToken({ id: adminUser.id, role: adminUser.role, isAgent: true });

    // Mock agent lookup in UserModel / AgentModel so `protect` middleware passes
    const agentModel = require('../models/agent');
    const originalFindAgentById = agentModel.findAgentById;

    agentModel.findAgentById = async (id) => {
        if (id === supportUser.id) return { ...supportUser };
        if (id === managerUser.id) return { ...managerUser };
        if (id === adminUser.id)   return { ...adminUser };
        return null;
    };

    try {
        const endpoints = [
            { name: 'Tickets', url: '/api/tickets/mock-ticket-id' },
            { name: 'Circuits', url: '/api/circuits/mock-circuit-id' },
            { name: 'Clients', url: '/api/clients/mock-client-id' },
            { name: 'Vendors', url: '/api/vendors/mock-vendor-id' },
            { name: 'Signatures', url: '/api/signatures/mock-signature-id' },
        ];

        console.log('\n  A) Support Crew (Unauthorized) Attempting DELETE on All Endpoints:');
        for (const ep of endpoints) {
            const res = await request(app)
                .delete(ep.url)
                .set('Authorization', `Bearer ${supportToken}`);

            assert(res.status === 403, `Support crew DELETE ${ep.name} returns 403 Forbidden`);
            assert(res.body.error && res.body.error.includes('Only Manager and Super Admin'), `Support crew receives clear permission error for ${ep.name}`);
        }

        console.log('\n  B) Manager (Authorized) Attempting DELETE on All Endpoints:');
        for (const ep of endpoints) {
            const res = await request(app)
                .delete(ep.url)
                .set('Authorization', `Bearer ${managerToken}`);

            // Since mock ID may not exist in DB, status will be 404 or 200 or 500 from controller, but strictly NOT 403
            assert(res.status !== 403, `Manager DELETE ${ep.name} bypasses auth guard (Status: ${res.status} != 403)`);
        }

        console.log('\n  C) Super Admin (Authorized) Attempting DELETE on All Endpoints:');
        for (const ep of endpoints) {
            const res = await request(app)
                .delete(ep.url)
                .set('Authorization', `Bearer ${adminToken}`);

            // Super Admin must strictly NOT receive 403
            assert(res.status !== 403, `Super Admin DELETE ${ep.name} bypasses auth guard (Status: ${res.status} != 403)`);
        }

        console.log('\n  D) Anonymous / No Token Attempting DELETE:');
        for (const ep of endpoints) {
            const res = await request(app)
                .delete(ep.url);

            assert(res.status === 401, `No Token DELETE ${ep.name} returns 401 Unauthorized`);
        }

    } finally {
        // Restore agent lookup
        agentModel.findAgentById = originalFindAgentById;
    }

    console.log('\n================================================================');
    console.log(`🎉 ALL TESTS PASSED: ${passedTests} / ${totalTests} checks passed successfully!`);
    console.log('================================================================\n');
}

runTests().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
