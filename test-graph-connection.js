require('dotenv').config();

async function testGraphAPI() {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;

    if (!tenantId || !clientId || !clientSecret) {
        console.error("Missing Graph API credentials in .env");
        return;
    }

    console.log(`Getting access token for ${tenantId}...`);
    
    // 1. Get Access Token using Client Credentials flow
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenData = new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });

    try {
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            body: tokenData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const tokenResult = await tokenResponse.json();
        
        if (!tokenResponse.ok) {
            console.error("Failed to get token:", tokenResult);
            return;
        }

        console.log("Access token retrieved successfully!");
        const accessToken = tokenResult.access_token;

        // 2. Test reading emails (IMAP equivalent)
        console.log(`\nTesting Mailbox Access for: ${userEmail}...`);
        const messagesUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages?$top=1`;
        
        const messagesResponse = await fetch(messagesUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const messagesResult = await messagesResponse.json();

        if (messagesResponse.ok) {
            console.log("Mailbox accessed successfully!");
            if (messagesResult.value && messagesResult.value.length > 0) {
                console.log(`Found recent message: "${messagesResult.value[0].subject}"`);
                console.log(`From: ${messagesResult.value[0].from?.emailAddress?.address}`);
            } else {
                console.log("Mailbox accessed, but inbox is empty.");
            }
        } else {
            console.error("Failed to access mailbox. Please ensure the App Registration has 'Mail.Read' Application permissions and Admin Consent is granted.");
            console.error("Error details:", messagesResult.error?.message || messagesResult);
        }

    } catch (err) {
        console.error("Network or execution error:", err);
    }
}

testGraphAPI();
