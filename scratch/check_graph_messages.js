'use strict';

require('dotenv').config();

async function check() {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenData = new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });

    const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        body: tokenData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const { access_token } = await tokenRes.json();

    console.log('=== CHECKING SENT ITEMS ===');
    const sentUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/sentitems/messages?$top=5&$select=id,internetMessageId,subject,from,toRecipients,sentDateTime,bodyPreview,conversationId`;
    const sentRes = await fetch(sentUrl, { headers: { 'Authorization': `Bearer ${access_token}` } });
    const sentData = await sentRes.json();
    console.log('Sent Items:', JSON.stringify(sentData.value?.map(m => ({
        id: m.id,
        messageId: m.internetMessageId,
        subject: m.subject,
        to: m.toRecipients?.map(r => r.emailAddress?.address),
        sent: m.sentDateTime,
        preview: m.bodyPreview,
        conversationId: m.conversationId
    })), null, 2));

    console.log('=== CHECKING INBOX ===');
    const inboxUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/inbox/messages?$top=5&$select=id,internetMessageId,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,conversationId`;
    const inboxRes = await fetch(inboxUrl, { headers: { 'Authorization': `Bearer ${access_token}` } });
    const inboxData = await inboxRes.json();
    console.log('Inbox Items:', JSON.stringify(inboxData.value?.map(m => ({
        id: m.id,
        messageId: m.internetMessageId,
        subject: m.subject,
        from: m.from?.emailAddress?.address,
        isRead: m.isRead,
        preview: m.bodyPreview,
        conversationId: m.conversationId
    })), null, 2));
}

check().catch(console.error);
