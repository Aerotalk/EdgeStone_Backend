require('dotenv').config();

const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.MAIL_USER;

async function getToken() {
    const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;
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
    return data.access_token;
}

async function markEmailAsRead(msgId, token) {
    const url = `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/messages/${msgId}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isRead: true })
    });
    if (!res.ok) {
        const error = await res.json();
        console.error(`❌ Failed to mark as read:`, error);
    }
}

(async () => {
    console.log("🚨 KILLING THE LOOP... Fetching token...");
    try {
        const token = await getToken();
        let loopCount = 0;

        // Fetch up to 100 unread messages globally (not just inbox, but likely in inbox)
        const url = `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/mailFolders/inbox/messages?$filter=isRead eq false&$top=100&$select=id,subject,from`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        
        if (data.value && data.value.length > 0) {
            console.log(`Found ${data.value.length} unread messages. Scanning for loop artifacts...`);
            for (const msg of data.value) {
                const subjectLower = (msg.subject || '').toLowerCase();
                const fromAddr = (msg.from?.emailAddress?.address || '').toLowerCase();
                
                if (subjectLower.includes('undeliverable') || 
                    fromAddr.includes('microsoftexchange') ||
                    fromAddr.includes('postmaster') ||
                    fromAddr.includes('mailer-daemon')) {
                    
                    console.log(`🗑️ Marking as READ (Loop artifact): ${msg.subject}`);
                    await markEmailAsRead(msg.id, token);
                    loopCount++;
                }
            }
            console.log(`🏁 Done! Extinguished ${loopCount} runaway bounce emails.`);
        } else {
            console.log("No unread messages found. Loop might already be paused.");
        }
    } catch(err) {
        console.error("Error running kill script:", err.message);
    }
})();
