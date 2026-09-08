require('dotenv').config();

async function testGraphSuggestions() {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;

    if (!tenantId || !clientId || !clientSecret) {
        console.error("Missing Graph API credentials in .env");
        return;
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenData = new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });

    const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        body: tokenData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const tokenResult = await tokenResponse.json();
    const accessToken = tokenResult.access_token;
    console.log("Token acquired.");

    // 1. Test /people
    try {
        console.log("Testing /users/" + userEmail + "/people ...");
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userEmail}/people?$top=10`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log("/people status:", res.status);
        const data = await res.json();
        if (res.ok) {
            console.log("People count:", data.value?.length);
            console.log("People sample:", JSON.stringify(data.value?.slice(0, 3).map(p => ({ name: p.displayName, emails: p.scoredEmailAddresses })), null, 2));
        } else {
            console.log("People error:", data.error?.message);
        }
    } catch (e) {
        console.error("People fetch error:", e.message);
    }

    // 2. Test /contacts
    try {
        console.log("\nTesting /users/" + userEmail + "/contacts ...");
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userEmail}/contacts?$top=10`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log("/contacts status:", res.status);
        const data = await res.json();
        if (res.ok) {
            console.log("Contacts count:", data.value?.length);
        } else {
            console.log("Contacts error:", data.error?.message);
        }
    } catch (e) {
        console.error("Contacts fetch error:", e.message);
    }

    // 3. Test sentitems recent recipients (The EXACT emails agents generally use in Outlook!)
    try {
        console.log("\nTesting /users/" + userEmail + "/mailFolders/sentitems/messages recent recipients ...");
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/sentitems/messages?$top=50&$select=toRecipients,ccRecipients,bccRecipients,sentDateTime`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log("sentitems status:", res.status);
        const data = await res.json();
        if (res.ok) {
            const recipientMap = new Map();
            for (const msg of data.value || []) {
                const all = [
                    ...(msg.toRecipients || []),
                    ...(msg.ccRecipients || []),
                    ...(msg.bccRecipients || [])
                ];
                for (const r of all) {
                    const addr = r.emailAddress?.address?.toLowerCase()?.trim();
                    const name = r.emailAddress?.name || addr;
                    if (addr) {
                        const count = recipientMap.get(addr)?.count || 0;
                        recipientMap.set(addr, { name, address: addr, count: count + 1 });
                    }
                }
            }
            console.log("Unique recent sent recipients found:", recipientMap.size);
            console.log("Top 5 recent recipients:", Array.from(recipientMap.values()).sort((a,b) => b.count - a.count).slice(0, 5));
        } else {
            console.log("sentitems error:", data.error?.message);
        }
    } catch (e) {
        console.error("sentitems fetch error:", e.message);
    }
}

testGraphSuggestions();
