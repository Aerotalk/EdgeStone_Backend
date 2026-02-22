// Check what Zoho actually returned in the token exchange
// Also verify the access token works by hitting the accounts endpoint
const https = require('https');
const fs = require('fs');

const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: '1000.TU9WVEG38X57ER6UE73OOB4LBWG9XH',
    client_secret: 'ca2e1118a844aedc8452c762148117aae8f15690a3',
    redirect_uri: 'https://edgestonebackend-production.up.railway.app/oauth/callback',
    code: 'ALREADY_USED'
}).toString();

// Just verify the current access token works
require('dotenv').config();
const token = process.env.ZOHO_ACCESS_TOKEN;
console.log('Testing access token:', token.substring(0, 30) + '...');

const req = https.get('https://mail.zoho.in/api/accounts', {
    headers: {
        Authorization: 'Zoho-oauthtoken ' + token,
        'Content-Type': 'application/json'
    }
}, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        const j = JSON.parse(d);
        const acct = j.data?.[0];
        console.log('HTTP Status:', res.statusCode);
        console.log('AccountId:', acct?.accountId);
        console.log('Email:', acct?.emailAddress);
        console.log('Full keys:', Object.keys(acct || {}));
    });
});
req.on('error', e => console.error(e.message));
