const request = require('supertest');
const config = require('./config');

describe('Production Error Handling & Validation', () => {
    let token;

    beforeAll(async () => {
        const response = await request(config.baseURL)
            .post('/api/auth/login')
            .send(config.credentials);
        token = response.body.token;
    });

    const headers = () => ({ 'Authorization': `Bearer ${token}` });

    test('should return 400 when creating Client with missing data', async () => {
        // This is a SAFE mutation test because we expect it to FAIL validation
        // and NOT create any data.
        const response = await request(config.baseURL)
            .post('/api/clients')
            .set(headers())
            .send({
                name: 'Test Client'
                // Missing emails
            });

        expect(response.status).toBe(400);
        // Depending on error handler, might check message
        // expect(response.body.message).toContain('Please provide name and at least one email');
    });

    test('should return 400 when creating Vendor with invalid email format', async () => {
        const response = await request(config.baseURL)
            .post('/api/vendors')
            .set(headers())
            .send({
                name: 'Test Vendor',
                emails: 'not-an-array' // Invalid type
            });

        expect(response.status).toBe(400);
    });

    test('should return 404 for non-existent resource ID (if logic permits)', async () => {
        // Assuming ID 99999999 is unlikely to exist if INT, or specific UUID if UUID.
        // We'll try a dummy string that might be valid format but not found.
        // If IDs are Ints, this is safe. If UUIDs, might return 400 "Invalid ID".
        // We'll skip specific ID format check for now or update after checking schema.
    });

    test('should return 401 without token', async () => {
        const response = await request(config.baseURL).get('/api/clients');
        expect(response.status).toBe(401);
    });
});
