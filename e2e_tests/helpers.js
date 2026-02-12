const request = require('supertest');
const config = require('./config');

const generateRandomString = (length = 8) => {
    return Math.random().toString(36).substring(2, 2 + length);
};

const login = async () => {
    const response = await request(config.baseURL)
        .post('/api/auth/login')
        .send({
            email: config.credentials.email,
            password: config.credentials.password
        });

    if (response.status !== 200) {
        throw new Error(`Login failed with status ${response.status}: ${JSON.stringify(response.body)}`);
    }
    return response.body.token;
};

module.exports = {
    generateRandomString,
    login
};
