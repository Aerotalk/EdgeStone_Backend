const request = require('supertest');
const config = require('./config');

describe('Production Health Check', () => {
    it('should return 200 OK and status message', async () => {
        const response = await request(config.baseURL).get('/');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'OK');
        expect(response.body).toHaveProperty('message', 'EdgeStone Ticket System API is running');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('version');
    });
});
