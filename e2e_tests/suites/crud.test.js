const request = require('supertest');
const config = require('../config');
const helpers = require('../helpers');

describe('E2E: Admin CRUD Operations', () => {
    let token;
    const suffix = helpers.generateRandomString();

    // Test Data
    const testAgent = {
        name: `E2E Agent ${suffix}`,
        email: `e2e_agent_${suffix}@example.com`,
        password: 'password123'
    };

    const testClient = {
        name: `E2E Client ${suffix}`,
        emails: [`client_${suffix}@example.com`]
    };

    const testVendor = {
        name: `E2E Vendor ${suffix}`,
        emails: [`vendor_${suffix}@example.com`]
    };

    beforeAll(async () => {
        token = await helpers.login();
    });

    const headers = () => ({ 'Authorization': `Bearer ${token}` });

    // --- Agent CRUD ---
    test('Create and Fetch Agent', async () => {
        // Create
        const createRes = await request(config.baseURL)
            .post('/api/agents')
            .set(headers())
            .send(testAgent);

        expect(createRes.status).toBe(201);
        expect(createRes.body.name).toBe(testAgent.name);
        const agentId = createRes.body.id;

        // Fetch List
        const listRes = await request(config.baseURL)
            .get('/api/agents')
            .set(headers());

        const found = listRes.body.find(a => a.id === agentId);
        expect(found).toBeTruthy();
        expect(found.email).toBe(testAgent.email);
    });

    // --- Client CRUD ---
    test('Create and Update Client', async () => {
        // Create
        const createRes = await request(config.baseURL)
            .post('/api/clients')
            .set(headers())
            .send(testClient);

        expect(createRes.status).toBe(201);
        const clientId = createRes.body.id;

        // Update
        const updateRes = await request(config.baseURL)
            .put(`/api/clients/${clientId}`)
            .set(headers())
            .send({ status: 'In-Active' }); // Mark inactive to "clean up" logic

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.status).toBe('In-Active');
    });

    // --- Vendor CRUD ---
    test('Create and Update Vendor', async () => {
        // Create
        const createRes = await request(config.baseURL)
            .post('/api/vendors')
            .set(headers())
            .send(testVendor);

        expect(createRes.status).toBe(201);
        const vendorId = createRes.body.id;

        // Update
        const updateRes = await request(config.baseURL)
            .put(`/api/vendors/${vendorId}`)
            .set(headers())
            .send({ status: 'In-Active' });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.status).toBe('In-Active');
    });
});
