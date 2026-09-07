'use strict';

require('dotenv').config();
const prisma = require('../models/index');

const stripHtml = (str) => {
    if (!str) return '';
    return str
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const stripQuotedReply = (text) => {
    if (!text) return '';
    let idx = text.search(/From:\s.*?\nSent:\s/i);
    if (idx !== -1) text = text.substring(0, idx);
    idx = text.search(/-+\s*Original Message\s*-+/i);
    if (idx !== -1) text = text.substring(0, idx);
    idx = text.search(/(?:^|\n)\s*On\s+[\s\S]{10,150}?wrote:/i);
    if (idx !== -1) text = text.substring(0, idx);
    idx = text.search(/_{10,}/);
    if (idx !== -1) text = text.substring(0, idx);
    return text.trim();
};

async function testSyncSent() {
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

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
    const { access_token: token } = await tokenRes.json();

    const sentUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/sentitems/messages?$top=5&$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,sentDateTime,body,hasAttachments`;
    const res = await fetch(sentUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const messages = data.value || [];

    for (const msg of messages) {
        if (!msg.subject || !msg.subject.includes('#1028')) continue;

        console.log(`\n========================================`);
        console.log(`Checking sent message: ${msg.subject}`);
        const bodyContent = msg.body?.content || '';
        const cleanText = stripQuotedReply(stripHtml(bodyContent));
        console.log('Clean Text Preview:', cleanText.substring(0, 80));

        const ticketMatch = msg.subject.match(/\[#?([A-Za-z0-9_-]+?)(?:-V)?\]/i);
        if (!ticketMatch) continue;
        const ticketId = '#' + ticketMatch[1].replace(/^#/, '');

        const ticket = await prisma.ticket.findFirst({
            where: { ticketId: { equals: ticketId, mode: 'insensitive' } },
            include: { replies: true }
        });

        if (!ticket) continue;

        const alreadyRecorded = ticket.replies?.some(r => {
            if (r.messageId && r.messageId === msg.internetMessageId) return true;
            const cleanRText = r.text.trim();
            if (cleanRText && cleanRText.length > 5 && cleanText.includes(cleanRText)) return true;
            return false;
        });

        console.log('Already Recorded in Portal DB?', alreadyRecorded);
        if (!alreadyRecorded) {
            console.log('🎯 DETECTED AS EXTERNAL OUTLOOK REPLY TO APPEND:');
            console.log('   Text:', cleanText);
            console.log('   Time:', msg.sentDateTime);
            console.log('   To:', msg.toRecipients?.map(r => r.emailAddress?.address).join(', '));
        }
    }
}

testSyncSent().catch(console.error);
