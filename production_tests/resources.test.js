const request = require('supertest');
const config = require('./config');

describe('Production Resources Access', () => {
    let token;

    beforeAll(async () => {
        // Login to get token
        const response = await request(config.baseURL)
            .post('/api/auth/login')
            .send({
                email: config.credentials.email,
                password: config.credentials.password
            });

        token = response.body.token;
        if (!token) {
            throw new Error('Authentication failed. Cannot run resource tests.');
        }
    });

    // Helper to check protected route
    const checkProtectedRoute = async (endpoint) => {
        const response = await request(config.baseURL)
            .get(endpoint)
            .set('Authorization', `Bearer ${token}`);

        if (response.status !== 200) {
            console.error(`Failed to fetch ${endpoint}:`, response.body);
        }
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true); // Assuming list endpoints return arrays
    };

    it('should fetch Tickets', async () => {
        await checkProtectedRoute('/api/tickets');
    });

    it('should fetch Agents', async () => {
        await checkProtectedRoute('/api/agents');
    });

    it('should fetch Clients', async () => {
        await checkProtectedRoute('/api/clients');
    });

    it('should fetch Vendors', async () => {
        await checkProtectedRoute('/api/vendors');
    });
});
