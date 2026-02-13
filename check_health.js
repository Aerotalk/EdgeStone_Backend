const https = require('https');

const url = 'https://edgestonebackend-production.up.railway.app/';

console.log(`Checking connectivity to: ${url}`);

https.get(url, (res) => {
    console.log('StatusCode:', res.statusCode);
    console.log('Headers:', res.headers);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Body:', data);
    });

}).on('error', (e) => {
    console.error('Error:', e);
});
