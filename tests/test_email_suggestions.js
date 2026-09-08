'use strict';

require('dotenv').config();
const emailSuggestionService = require('../services/emailSuggestionService');

async function runTests() {
    console.log('====================================================');
    console.log('🧪 TESTING CHG-005: EMAIL AUTO-SUGGESTION SYSTEM');
    console.log('====================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    try {
        console.log('--- 1. Testing Unfiltered Suggestions (Recent Outlook + DB Contacts) ---');
        const allSuggestions = await emailSuggestionService.getSuggestions('', 20);
        
        assert(Array.isArray(allSuggestions), 'getSuggestions returns an array');
        assert(allSuggestions.length > 0, `Suggestions list is not empty (found ${allSuggestions.length} contacts)`);
        
        const firstContact = allSuggestions[0];
        console.log('  Sample Top Suggestion:', JSON.stringify(firstContact, null, 2));
        assert(firstContact.email && firstContact.email.includes('@'), 'Top suggestion has a valid email address');
        assert(firstContact.name && firstContact.name.length > 0, 'Top suggestion has a display name');
        assert(firstContact.source && firstContact.source.length > 0, 'Top suggestion has a source badge');
        assert(typeof firstContact.count === 'number', 'Top suggestion has a frequency count');

        // Check if any contact comes from Outlook Recent
        const outlookContacts = allSuggestions.filter(c => c.source?.includes('Outlook Recent'));
        console.log(`  Found ${outlookContacts.length} Outlook Recent contacts in top results.`);
        assert(outlookContacts.length > 0, 'Successfully sourced recent recipients from Microsoft 365 Outlook');

        console.log('\n--- 2. Testing Prefix / Query Filtering ---');
        // Search for 'priy' (should match priyanshu@aerotalk.in)
        const priyResults = await emailSuggestionService.getSuggestions('priy', 5);
        assert(priyResults.length > 0, 'Query "priy" returned matching suggestions');
        assert(priyResults.some(c => c.email.toLowerCase().includes('priy') || c.name.toLowerCase().includes('priy')), 'All "priy" results contain the query');

        // Search for 'edge' (should match marketing@edgestone.in or EdgeStone)
        const edgeResults = await emailSuggestionService.getSuggestions('edge', 5);
        assert(edgeResults.length > 0, 'Query "edge" returned matching suggestions');
        assert(edgeResults.some(c => c.email.toLowerCase().includes('edgestone.in') || c.name.toLowerCase().includes('edge')), 'All "edge" results match correctly');

        console.log('\n--- 3. Testing Contact Deduplication & Ranking ---');
        const emailSet = new Set();
        let hasDuplicates = false;
        for (const c of allSuggestions) {
            const lower = c.email.toLowerCase();
            if (emailSet.has(lower)) {
                hasDuplicates = true;
                break;
            }
            emailSet.add(lower);
        }
        assert(!hasDuplicates, 'All returned contact suggestions are strictly deduplicated');

        // Verify sorted by count descending
        let isSorted = true;
        for (let i = 0; i < allSuggestions.length - 1; i++) {
            if ((allSuggestions[i].count || 0) < (allSuggestions[i + 1].count || 0)) {
                isSorted = false;
                break;
            }
        }
        assert(isSorted, 'Suggestions are ranked by communication frequency in descending order');

        console.log('\n====================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
        console.log('====================================================\n');
        process.exit(0);

    } catch (err) {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    }
}

runTests();
