const request = require('supertest');
const config = require('./config');

describe('Production Resource Structure', () => {
    let token;

    beforeAll(async () => {
        const response = await request(config.baseURL)
            .post('/api/auth/login')
            .send(config.credentials);
        token = response.body.token;
    });

    const headers = () => ({ 'Authorization': `Bearer ${token}` });

    test('access to Clients returns correct structure', async () => {
        const response = await request(config.baseURL).get('/api/clients').set(headers());
        if (response.status !== 200) {
            console.log('Clients Test Failed:', response.status, JSON.stringify(response.body));
        }
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
            const client = response.body[0];
            expect(client).toHaveProperty('id');
            expect(client).toHaveProperty('name');
            expect(client).toHaveProperty('emails');
            expect(client).toHaveProperty('status');
        }
    });

    test('access to Vendors returns correct structure', async () => {
        const response = await request(config.baseURL).get('/api/vendors').set(headers());
        if (response.status !== 200) {
            console.log('Vendors Test Failed:', response.status, JSON.stringify(response.body));
        }
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
            const vendor = response.body[0];
            expect(vendor).toHaveProperty('id');
            expect(vendor).toHaveProperty('name');
            expect(vendor).toHaveProperty('emails');
        }
    });

    test('access to Agents returns correct structure', async () => {
        const response = await request(config.baseURL).get('/api/agents').set(headers());
        if (response.status !== 200) {
            console.log('Agents Test Failed:', response.status, JSON.stringify(response.body));
        }
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
            const agent = response.body[0];
            expect(agent).toHaveProperty('id');
            expect(agent).toHaveProperty('name');
            expect(agent).toHaveProperty('email');
            expect(agent).toHaveProperty('role');
        }
    });
});
