'use strict';

require('dotenv').config();

async function inspectSentMessage() {
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

    const msgId = 'AAMkADk0YjhjODg0LTdmMGEtNDBjZC05NTZhLWVjODBhOGE2MzE5YwBGAAAAAAB5bZm0wPHBSLPHtanVJob2BwDmaQNQcO3fQqZSqfl9eyXSAAAAAAEJAADmaQNQcO3fQqZSqfl9eyXSAABvHyUPAAA=';
    const msgUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${msgId}?$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,sentDateTime,body,internetMessageHeaders,hasAttachments`;

    const res = await fetch(msgUrl, { headers: { 'Authorization': `Bearer ${access_token}` } });
    const msg = await res.json();

    console.log('Subject:', msg.subject);
    console.log('InternetMessageId:', msg.internetMessageId);
    console.log('From:', msg.from);
    console.log('To:', msg.toRecipients);
    console.log('CC:', msg.ccRecipients);
    console.log('Headers:', msg.internetMessageHeaders);
    console.log('HasAttachments:', msg.hasAttachments);
    console.log('SentDateTime:', msg.sentDateTime);
    console.log('Body snippet:', msg.body?.content?.substring(0, 300));
}

inspectSentMessage().catch(console.error);
