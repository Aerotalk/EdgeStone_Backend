require('dotenv').config();

module.exports = {
    baseURL: process.env.PROD_API_URL || 'https://edgestonebackend-production.up.railway.app',
    credentials: {
        email: process.env.PROD_TEST_EMAIL || 'it@edgestone.in',
        password: process.env.PROD_TEST_PASSWORD || 'i@edgestone123'
    },
    email: {
        host: process.env.IMAP_HOST || 'imap.zoho.in',
        port: process.env.IMAP_PORT || 993,
        user: process.env.MAIL_USER || 'it@edgestone.in',
        password: process.env.MAIL_PASSWORD || process.env.PROD_TEST_PASSWORD || 'i@edgestone123',
        tls: true
    }
};
