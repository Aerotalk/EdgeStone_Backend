'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../models/index');
const ticketService = require('../services/ticketService');

async function testSentItems() {
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

    const res = await fetch(tokenUrl, {
        method: 'POST',
        body: tokenData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const { access_token } = await res.json();
    console.log('Access token retrieved successfully.');

    const sentUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/sentitems/messages?$top=10&$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,body,sentDateTime,internetMessageHeaders,hasAttachments&$orderby=sentDateTime desc`;
    const sentRes = await fetch(sentUrl, {
        headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (!sentRes.ok) {
        console.error('Sent items error:', sentRes.status, await sentRes.text());
        return;
    }

    const sentData = await sentRes.json();
    console.log(`Found ${sentData.value?.length || 0} messages in Sent Items.`);

    for (const msg of (sentData.value || [])) {
        console.log('\n----------------------------------------');
        console.log(`ID: ${msg.id}`);
        console.log(`InternetMessageId: ${msg.internetMessageId}`);
        console.log(`Subject: ${msg.subject}`);
        console.log(`Sent: ${msg.sentDateTime}`);
        const inReplyTo = msg.internetMessageHeaders?.find(h => h.name?.toLowerCase() === 'in-reply-to')?.value;
        const references = msg.internetMessageHeaders?.find(h => h.name?.toLowerCase() === 'references')?.value;
        console.log(`In-Reply-To: ${inReplyTo}`);
        console.log(`References: ${references}`);

        const existingTicket = await ticketService.findExistingTicketForReply(inReplyTo, references, msg.subject, msg.body?.content);
        if (existingTicket) {
            console.log(`>>> MATCHED TICKET: ${existingTicket.ticketId} (${existingTicket.id})`);
            const cleanText = ticketService.stripQuotedReply(ticketService.stripHtml(msg.body?.content || ''));
            console.log(`Clean reply text: "${cleanText.slice(0, 100)}..."`);

            const existingReplies = await prisma.reply.findMany({ where: { ticketId: existingTicket.id } });
            const alreadyExists = existingReplies.some(r => 
                (r.messageId && r.messageId === msg.internetMessageId) ||
                (r.text && r.text.trim().length > 5 && cleanText.includes(r.text.trim()))
            );
            console.log(`Already in DB? ${alreadyExists}`);
            if (!alreadyExists) {
                console.log('>>> THIS IS A NEW OUTLOOK REPLY TO INGEST!');
            }
        } else {
            console.log('No ticket matched.');
        }
    }
}

testSentItems()
    .then(() => prisma.$disconnect())
    .catch(err => {
        console.error(err);
        prisma.$disconnect();
    });
