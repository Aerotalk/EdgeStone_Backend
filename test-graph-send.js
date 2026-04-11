/**
 * test-graph-send.js
 * Quick smoke test: sends a test email via Microsoft Graph API.
 * Run with: node test-graph-send.js
 */
require('dotenv').config();

async function getToken() {
    const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;
    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
        console.error('❌ Missing TENANT_ID, CLIENT_ID, or CLIENT_SECRET in .env');
        process.exit(1);
    }

    const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: CLIENT_SECRET,
        grant_type: 'client_credentials',
    });

    const res = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = await res.json();
    if (!res.ok) {
        console.error('❌ Token fetch failed:', data.error_description || data.error);
        process.exit(1);
    }

    console.log('✅ Token acquired successfully.');
    return data.access_token;
}

async function sendTestEmail(token) {
    const senderEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    const TO_ADDRESS = senderEmail; // send to self as a test

    const message = {
        subject: '✅ Graph API Send Test — EdgeStone Ticketing System',
        body: {
            contentType: 'HTML',
            content: '<b>This is a test email sent via Microsoft Graph API.</b><p>If you are reading this, the email sending pipeline is working correctly.</p>',
        },
        toRecipients: [{ emailAddress: { address: TO_ADDRESS } }],
        from: { emailAddress: { address: senderEmail, name: 'EdgeStone Support' } },
    };

    const url = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (res.status === 202) {
        console.log(`✅ SUCCESS: Test email sent to ${TO_ADDRESS} via Graph API!`);
    } else {
        let errBody = {};
        try { errBody = await res.json(); } catch (_) {}
        console.error(`❌ FAILED: HTTP ${res.status}`, errBody.error?.message || errBody);
        process.exit(1);
    }
}

(async () => {
    console.log('\n--- MS Graph API Send Test ---');
    console.log(`Sender: ${process.env.SENDER_EMAIL || process.env.MAIL_USER}`);
    const token = await getToken();
    await sendTestEmail(token);
    console.log('--- Done ---\n');
})();
