const request = require('supertest');
const config = require('./config');

describe('Production Authentication', () => {
    it('should login successfully with admin credentials', async () => {
        const response = await request(config.baseURL)
            .post('/api/auth/login')
            .send({
                email: config.credentials.email,
                password: config.credentials.password
            });

        if (response.status !== 200) {
            console.error('Login Failed:', response.body);
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body.user).toHaveProperty('email', config.credentials.email);
    });

    it('should fail with invalid credentials', async () => {
        const response = await request(config.baseURL)
            .post('/api/auth/login')
            .send({
                email: 'invalid@example.com',
                password: 'wrongpassword'
            });

        expect(response.status).toBe(400); // Or 401 depending on implementation
    });
});
