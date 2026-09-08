'use strict';

const prisma = require('../models/index');
const logger = require('../utils/logger');

let graphAccessToken = null;
let tokenExpiresAt = 0;

let cachedContacts = [];
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Retrieve Microsoft Graph access token
 */
const getGraphAccessToken = async () => {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        return null;
    }

    if (graphAccessToken && Date.now() < tokenExpiresAt) {
        return graphAccessToken;
    }

    try {
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const tokenData = new URLSearchParams({
            client_id: clientId,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: clientSecret,
            grant_type: 'client_credentials'
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            body: tokenData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            logger.warn(`[SUGGESTIONS] Graph token error: ${err.error_description || response.status}`);
            return null;
        }

        const result = await response.json();
        graphAccessToken = result.access_token;
        tokenExpiresAt = Date.now() + (result.expires_in * 1000) - 300000;
        return graphAccessToken;
    } catch (err) {
        logger.error(`[SUGGESTIONS] Error obtaining Graph token: ${err.message}`);
        return null;
    }
};

/**
 * Fetch recent recipients from Outlook Sent Items via Microsoft Graph API
 */
const fetchOutlookRecentRecipients = async () => {
    const userEmail = process.env.SENDER_EMAIL || process.env.MAIL_USER;
    if (!userEmail) return [];

    const token = await getGraphAccessToken();
    if (!token) return [];

    try {
        const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/sentitems/messages?$top=50&$select=toRecipients,ccRecipients,bccRecipients,sentDateTime&$orderby=sentDateTime desc`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            logger.warn(`[SUGGESTIONS] Could not fetch sent items: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const messages = data.value || [];
        const recipientMap = new Map();

        for (const msg of messages) {
            const allRecipients = [
                ...(msg.toRecipients || []),
                ...(msg.ccRecipients || []),
                ...(msg.bccRecipients || [])
            ];

            for (const r of allRecipients) {
                const address = r.emailAddress?.address?.trim();
                if (!address || !address.includes('@')) continue;

                const lower = address.toLowerCase();
                // Filter out self/system mailboxes if desired, or keep with appropriate naming
                const existing = recipientMap.get(lower);
                const name = (r.emailAddress?.name && r.emailAddress.name !== address) ? r.emailAddress.name : (existing?.name || '');

                if (existing) {
                    existing.count += 1;
                    if (!existing.name && name) existing.name = name;
                } else {
                    recipientMap.set(lower, {
                        email: address,
                        name: name || address.split('@')[0],
                        count: 1,
                        source: 'Outlook Recent',
                        category: 'recent'
                    });
                }
            }
        }

        return Array.from(recipientMap.values());
    } catch (err) {
        logger.error(`[SUGGESTIONS] Failed to fetch Outlook sent items: ${err.message}`);
        return [];
    }
};

/**
 * Fetch database contacts (Clients, Vendors, Agents, Users, and previous Ticket participants)
 */
const fetchDatabaseContacts = async () => {
    const contacts = [];
    try {
        // 1. Clients
        const clients = await prisma.client.findMany({
            select: { name: true, emails: true }
        });
        for (const c of clients) {
            if (Array.isArray(c.emails)) {
                for (const em of c.emails) {
                    const clean = em && em.trim();
                    if (clean && clean.includes('@')) {
                        contacts.push({
                            email: clean,
                            name: c.name,
                            source: `Client: ${c.name}`,
                            category: 'client',
                            count: 10
                        });
                    }
                }
            }
        }

        // 2. Vendors
        const vendors = await prisma.vendor.findMany({
            select: { name: true, emails: true }
        });
        for (const v of vendors) {
            if (Array.isArray(v.emails)) {
                for (const em of v.emails) {
                    const clean = em && em.trim();
                    if (clean && clean.includes('@')) {
                        contacts.push({
                            email: clean,
                            name: v.name,
                            source: `Vendor: ${v.name}`,
                            category: 'vendor',
                            count: 8
                        });
                    }
                }
            }
        }

        // 3. Agents / Crew
        const agents = await prisma.agent.findMany({
            select: { name: true, email: true, emails: true, role: true }
        });
        for (const a of agents) {
            const allEmails = [a.email, ...(Array.isArray(a.emails) ? a.emails : [])];
            for (const em of allEmails) {
                const clean = em && em.trim();
                if (clean && clean.includes('@')) {
                    contacts.push({
                        email: clean,
                        name: a.name,
                        source: `Crew: ${a.role || 'Support'}`,
                        category: 'crew',
                        count: 5
                    });
                }
            }
        }

        // 4. Users
        const users = await prisma.user.findMany({
            select: { name: true, email: true, role: true }
        });
        for (const u of users) {
            const clean = u.email && u.email.trim();
            if (clean && clean.includes('@')) {
                contacts.push({
                    email: clean,
                    name: u.name,
                    source: `Crew: ${u.role || 'Agent'}`,
                    category: 'crew',
                    count: 5
                });
            }
        }

        // 5. Recent ticket replies contacts
        const recentReplies = await prisma.reply.findMany({
            select: { to: true, cc: true, bcc: true, author: true },
            take: 50,
            orderBy: { createdAt: 'desc' }
        });
        for (const rep of recentReplies) {
            const replyEmails = [
                ...(Array.isArray(rep.to) ? rep.to : []),
                ...(Array.isArray(rep.cc) ? rep.cc : []),
                ...(Array.isArray(rep.bcc) ? rep.bcc : [])
            ];
            for (const em of replyEmails) {
                const clean = em && em.trim();
                if (clean && clean.includes('@')) {
                    contacts.push({
                        email: clean,
                        name: rep.author || clean.split('@')[0],
                        source: 'Ticket History',
                        category: 'history',
                        count: 3
                    });
                }
            }
        }

    } catch (err) {
        logger.error(`[SUGGESTIONS] Failed to fetch database contacts: ${err.message}`);
    }

    return contacts;
};

/**
 * Rebuild and merge contacts cache from Outlook Sent Items & Database
 */
const refreshContactsCache = async () => {
    logger.info('[SUGGESTIONS] Refreshing email suggestion contacts cache...');

    const [outlookRecipients, dbContacts] = await Promise.all([
        fetchOutlookRecentRecipients(),
        fetchDatabaseContacts()
    ]);

    const mergedMap = new Map();

    // 1. Insert Outlook recent recipients first (they have real user communication frequency)
    for (const item of outlookRecipients) {
        const lower = item.email.toLowerCase();
        mergedMap.set(lower, { ...item });
    }

    // 2. Merge DB contacts
    for (const item of dbContacts) {
        const lower = item.email.toLowerCase();
        const existing = mergedMap.get(lower);

        if (existing) {
            // Enhance existing Outlook contact with formal Client/Vendor/Crew name and badge
            if (!existing.name || existing.name === existing.email.split('@')[0]) {
                existing.name = item.name;
            }
            if (item.category !== 'history') {
                existing.source = `${item.source} • ${existing.source}`;
                existing.category = item.category;
            }
            existing.count = (existing.count || 0) + (item.count || 1);
        } else {
            mergedMap.set(lower, { ...item });
        }
    }

    cachedContacts = Array.from(mergedMap.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
    lastCacheUpdate = Date.now();
    logger.info(`[SUGGESTIONS] ✅ Contacts cache updated with ${cachedContacts.length} unique auto-suggest recipients.`);
    return cachedContacts;
};

/**
 * Get suggestions matching search query
 * @param {string} query - search query (prefix, name, email)
 * @param {number} limit - maximum results to return
 */
const getSuggestions = async (query = '', limit = 15) => {
    // If cache is empty or expired, trigger refresh
    if (cachedContacts.length === 0 || (Date.now() - lastCacheUpdate) > CACHE_TTL_MS) {
        try {
            await refreshContactsCache();
        } catch (err) {
            logger.error(`[SUGGESTIONS] Error in cache refresh: ${err.message}`);
        }
    }

    const cleanQ = (query || '').trim().toLowerCase();

    if (!cleanQ) {
        return cachedContacts.slice(0, limit);
    }

    // Filter by name or email
    const matches = cachedContacts.filter(c => {
        const nameMatch = c.name && c.name.toLowerCase().includes(cleanQ);
        const emailMatch = c.email && c.email.toLowerCase().includes(cleanQ);
        return nameMatch || emailMatch;
    });

    // Sort matching contacts: exact prefix matches score highest
    matches.sort((a, b) => {
        const aNameStarts = a.name && a.name.toLowerCase().startsWith(cleanQ);
        const bNameStarts = b.name && b.name.toLowerCase().startsWith(cleanQ);
        const aEmailStarts = a.email && a.email.toLowerCase().startsWith(cleanQ);
        const bEmailStarts = b.email && b.email.toLowerCase().startsWith(cleanQ);

        if ((aNameStarts || aEmailStarts) && !(bNameStarts || bEmailStarts)) return -1;
        if (!(aNameStarts || aEmailStarts) && (bNameStarts || bEmailStarts)) return 1;

        return (b.count || 0) - (a.count || 0);
    });

    return matches.slice(0, limit);
};

module.exports = {
    getSuggestions,
    refreshContactsCache
};
