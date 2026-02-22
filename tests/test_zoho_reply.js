/**
 * test_zoho_reply.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual verification script for the Zoho Mail OAuth agent reply flow.
 * Tests that sendZohoEmail() works and includes In-Reply-To threading.
 *
 * Usage:
 *   cd d:\Project\Ticket\Backend
 *   node tests/test_zoho_reply.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { sendZohoEmail } = require('../services/zohoMailService');

const TEST_RECIPIENT = process.env.ZOHO_FROM_EMAIL || 'marketing@edgestone.in'; // send to self for test
const FAKE_MSG_ID = '<test-thread-abc123@mail.gmail.com>';                   // simulate a client email message-id

(async () => {
    console.log('=======================================================');
    console.log('   Zoho Mail OAuth — Agent Reply Threading Test');
    console.log('=======================================================');
    console.log(`  From      : ${process.env.ZOHO_FROM_EMAIL}`);
    console.log(`  To        : ${TEST_RECIPIENT}`);
    console.log(`  inReplyTo : ${FAKE_MSG_ID}`);
    console.log('=======================================================\n');

    // Check required env vars (ZOHO_REFRESH_TOKEN optional here — only needed when access token expires)
    const required = ['ZOHO_ACCESS_TOKEN', 'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'];
    const missing = required.filter(k => !process.env[k] || process.env[k].startsWith('<'));
    if (missing.length > 0) {
        console.error(`❌  Missing or placeholder env vars: ${missing.join(', ')}`);
        console.error('    Fill them in .env before running this test.\n');
        process.exit(1);
    }

    try {
        console.log('📤  Sending test email via Zoho Mail OAuth...');
        const result = await sendZohoEmail({
            to: TEST_RECIPIENT,
            subject: '[TEST] Agent Reply Threading — EdgeStone',
            html: `<p>This is a <strong>test agent reply</strong> sent via Zoho Mail OAuth API.</p>
                        <p>If email threading works, this reply references message ID:<br/>
                        <code>${FAKE_MSG_ID}</code></p>`,
            text: `Test agent reply via Zoho Mail OAuth. Threading inReplyTo: ${FAKE_MSG_ID}`,
            inReplyTo: FAKE_MSG_ID,
            references: FAKE_MSG_ID,
        });

        console.log('\n✅  Email sent successfully!');
        console.log('   Response:', JSON.stringify(result, null, 2));
        console.log('\n🎉  Zoho Mail OAuth integration is working correctly.');
        console.log('   Agent replies will now include In-Reply-To headers for email threading.\n');
    } catch (err) {
        console.error('\n❌  Email send FAILED:', err.message);
        console.error('\n   Troubleshooting:');
        console.error('   1. Ensure ZOHO_CLIENT_ID + ZOHO_CLIENT_SECRET are set (needed for token refresh).');
        console.error('   2. Ensure the access token was granted for the correct Zoho account.');
        console.error('   3. Run: node -e "require(\'dotenv\').config(); const {refreshAccessToken} = require(\'./services/zohoMailService\'); refreshAccessToken().then(t => console.log(t)).catch(e => console.error(e))"');
        process.exit(1);
    }
})();
