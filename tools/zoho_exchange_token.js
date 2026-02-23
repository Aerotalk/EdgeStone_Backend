const https = require('https');
const fs = require('fs');
const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: '1000.TU9WVEG38X57ER6UE73OOB4LBWG9XH',
    client_secret: 'ca2e1118a844aedc8452c762148117aae8f15690a3',
    redirect_uri: 'https://edgestonebackend-production.up.railway.app/oauth/callback',
    code: '1000.449fc16742ec661e7707b53b0c7220f9.b9e2a4ad65f3bc4a8c8411e540dbc467'
}).toString();

const req = https.request('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
    }
}, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        const j = JSON.parse(d);
        if (j.error) {
            console.error('ERROR:', j.error, j.error_description || '');
            process.exit(1);
        }
        console.log('ACCESS_TOKEN=' + j.access_token);
        console.log('REFRESH_TOKEN=' + j.refresh_token);
        // Update .env atomically
        let env = fs.readFileSync('.env', 'utf8');
        env = env.replace(/ZOHO_ACCESS_TOKEN="[^"]*"/, 'ZOHO_ACCESS_TOKEN="' + j.access_token + '"');
        env = env.replace(/ZOHO_REFRESH_TOKEN="[^"]*"/, 'ZOHO_REFRESH_TOKEN="' + j.refresh_token + '"');
        fs.writeFileSync('.env', env);
        console.log('SUCCESS: .env updated with fresh tokens!');
    });
});
req.on('error', e => console.error(e.message));
req.write(body);
req.end();
