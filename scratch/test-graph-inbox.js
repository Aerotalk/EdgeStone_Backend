/**
 * test-graph-inbox.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Diagnostic script — tests whether the Graph API can READ emails from the
 * mailbox. Run with:  node test-graph-inbox.js
 *
 * Reports:
 *  1. Token acquisition
 *  2. Mailbox profile (confirms we're hitting the right account)
 *  3. Mail folder list (inbox, sent, etc.)
 *  4. /messages endpoint (all folders — used by old code)
 *  5. /mailFolders/inbox/messages (inbox only — used by new code)
 *  6. Last 3 messages found (with from / subject / isRead)
 */
require('dotenv').config();

const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.MAIL_USER;

async function getToken() {
    const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;
    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
        console.error('❌ TENANT_ID / CLIENT_ID / CLIENT_SECRET missing in .env');
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
        console.error('❌ Token fetch FAILED:', data.error_description || data.error);
        process.exit(1);
    }
    console.log('✅ [1] Token acquired. Expires in:', data.expires_in, 'seconds');
    return data.access_token;
}

async function graphGet(token, path, label) {
    const url = `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}${path}`;
    console.log(`\n🔗 [${label}] GET ${url}`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
        console.error(`   ❌ FAILED HTTP ${res.status}:`, data.error?.message || JSON.stringify(data.error));
        return null;
    }
    return data;
}

(async () => {
    console.log('\n════════════════════════════════════════════════');
    console.log(' MS Graph API — Inbox Diagnostic');
    console.log(`  Mailbox : ${SENDER_EMAIL}`);
    console.log('════════════════════════════════════════════════');

    const token = await getToken();

    // 2. Mailbox profile
    const profile = await graphGet(token, '', '2 — Mailbox profile');
    if (profile) {
        console.log(`   ✅ Mailbox: ${profile.displayName} <${profile.mail || profile.userPrincipalName}>`);
    }

    // 3. List mail folders
    const folders = await graphGet(token, '/mailFolders?$top=10', '3 — Mail folders');
    if (folders?.value) {
        console.log('   ✅ Folders found:');
        folders.value.forEach(f => {
            console.log(`      - ${f.displayName} (unreadCount: ${f.unreadItemCount}, total: ${f.totalItemCount})`);
        });
    }

    // 4. /messages (all folders) unread count
    const allMsgs = await graphGet(token, '/messages?$filter=isRead eq false&$top=5&$select=id,subject,from,isRead,receivedDateTime', '4 — /messages unread (all folders)');
    if (allMsgs?.value) {
        console.log(`   ✅ Unread across ALL folders: ${allMsgs.value.length} (showing up to 5)`);
        allMsgs.value.forEach(m => {
            console.log(`      - FROM: ${m.from?.emailAddress?.address} | SUBJECT: "${m.subject}" | isRead: ${m.isRead}`);
        });
    }

    // 5. /mailFolders/inbox/messages unread count
    const inboxMsgs = await graphGet(token, '/mailFolders/inbox/messages?$filter=isRead eq false&$top=5&$select=id,subject,from,isRead,receivedDateTime', '5 — /mailFolders/inbox/messages unread');
    if (inboxMsgs?.value) {
        console.log(`   ✅ Unread in INBOX: ${inboxMsgs.value.length} (showing up to 5)`);
        inboxMsgs.value.forEach(m => {
            console.log(`      - FROM: ${m.from?.emailAddress?.address} | SUBJECT: "${m.subject}" | isRead: ${m.isRead}`);
        });
    }

    // 6. Latest 3 messages (any read state) in inbox
    const latestMsgs = await graphGet(token, '/mailFolders/inbox/messages?$top=3&$orderby=receivedDateTime desc&$select=id,subject,from,isRead,receivedDateTime', '6 — Latest 3 inbox messages (any state)');
    if (latestMsgs?.value) {
        console.log(`   ✅ Latest inbox messages:`);
        latestMsgs.value.forEach(m => {
            console.log(`      - [${m.isRead ? 'READ  ' : 'UNREAD'}] FROM: ${m.from?.emailAddress?.address} | "${m.subject}" @ ${m.receivedDateTime}`);
        });
    }

    console.log('\n════════════════════════════════════════════════');
    console.log(' Diagnostic complete. Check output above.');
    console.log('════════════════════════════════════════════════\n');
})();
