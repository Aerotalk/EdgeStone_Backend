const request = require('supertest');
const app = require('../../server'); // Assuming server.js exports 'app'
// If server.js starts the server immediately, we might need to modify it to export app only, 
// or Jest might hang. We'll check this.

describe('Superadmin Login', () => {

    const superAdminCredentials = {
        email: 'it@edgestone.in',
        password: 'i@edgestone123'
    };

    it('should login successfully with valid superadmin credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send(superAdminCredentials);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('access');
        expect(res.body.access.superAdmin).toBe(true);

        console.log('Login Response:', res.body);
    });

    it('should fail with invalid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'it@edgestone.in',
                password: 'wrongpassword'
            });

        expect([400, 401]).toContain(res.statusCode);
    });
});
