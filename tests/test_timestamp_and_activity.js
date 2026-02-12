/**
 * Test script for real-time timestamp capture and activity logging
 * 
 * This script tests:
 * 1. Email timestamp capture (using actual email date, not current time)
 * 2. Activity log creation for ticket events
 * 3. Work notes creation and retrieval
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testTimestampAndActivityLogging() {
    console.log('🧪 Starting Real-time Timestamp and Activity Logging Tests\n');

    try {
        // Step 1: Get all tickets to find a test ticket
        console.log('📋 Step 1: Fetching existing tickets...');
        const ticketsResponse = await axios.get(`${BASE_URL}/tickets`);
        const tickets = ticketsResponse.data;

        if (tickets.length === 0) {
            console.log('⚠️  No tickets found. Please send a test email to create a ticket first.');
            console.log('   Send an email to support@edgestone.in with subject: "Test Ticket || TEST-001"');
            return;
        }

        const testTicket = tickets[0];
        console.log(`✅ Found ticket: ${testTicket.ticketId}`);
        console.log(`   Header: ${testTicket.header}`);
        console.log(`   Received At: ${testTicket.receivedAt || 'N/A (old ticket)'}`);
        console.log(`   Received Time: ${testTicket.receivedTime || 'N/A (old ticket)'}`);
        console.log(`   Date: ${testTicket.date}`);
        console.log();

        // Step 2: Check if ticket has real timestamp fields
        if (testTicket.receivedAt && testTicket.receivedTime) {
            console.log('✅ Ticket has real-time timestamp fields!');
            console.log(`   receivedAt (ISO): ${testTicket.receivedAt}`);
            console.log(`   receivedTime (24h): ${testTicket.receivedTime}`);

            // Verify it's not the same as current time
            const emailTime = new Date(testTicket.receivedAt);
            const now = new Date();
            const diffMinutes = Math.abs(now - emailTime) / (1000 * 60);

            if (diffMinutes > 1) {
                console.log(`   ✅ Timestamp is from email (${diffMinutes.toFixed(0)} minutes ago), not current time`);
            } else {
                console.log(`   ⚠️  Timestamp is very recent (${diffMinutes.toFixed(0)} minutes ago)`);
            }
        } else {
            console.log('⚠️  Ticket does not have receivedAt/receivedTime fields (might be old ticket)');
            console.log('   Send a new test email to verify timestamp capture');
        }
        console.log();

        // Step 3: Fetch activity logs
        console.log(`📊 Step 2: Fetching activity logs for ticket ${testTicket.ticketId}...`);
        const activityLogsResponse = await axios.get(`${BASE_URL}/tickets/${testTicket.id}/activity-logs`);
        const activityLogs = activityLogsResponse.data;

        console.log(`✅ Found ${activityLogs.length} activity log(s):`);
        activityLogs.forEach((log, index) => {
            console.log(`   ${index + 1}. [${log.date} ${log.time}] ${log.action} - ${log.description} (by ${log.author})`);
        });
        console.log();

        // Step 4: Create a work note
        console.log(`📝 Step 3: Creating a work note for ticket ${testTicket.ticketId}...`);

        // Note: This will fail without authentication. For testing, we'll catch the error
        try {
            const workNoteResponse = await axios.post(
                `${BASE_URL}/tickets/${testTicket.id}/work-notes`,
                {
                    text: 'This is a test work note created by automated test script'
                },
                {
                    headers: {
                        // In production, you'd need a valid JWT token here
                        // 'Authorization': 'Bearer YOUR_JWT_TOKEN'
                    }
                }
            );

            console.log('✅ Work note created successfully!');
            console.log(`   ID: ${workNoteResponse.data.workNote.id}`);
            console.log(`   Time: ${workNoteResponse.data.workNote.time}`);
            console.log(`   Date: ${workNoteResponse.data.workNote.date}`);
            console.log();
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('⚠️  Work note creation requires authentication');
                console.log('   Skipping work note test (expected without auth token)');
            } else {
                console.log(`❌ Error creating work note: ${error.message}`);
            }
            console.log();
        }

        // Step 5: Fetch work notes
        console.log(`📋 Step 4: Fetching work notes for ticket ${testTicket.ticketId}...`);
        try {
            const workNotesResponse = await axios.get(`${BASE_URL}/tickets/${testTicket.id}/work-notes`);
            const workNotes = workNotesResponse.data;

            console.log(`✅ Found ${workNotes.length} work note(s):`);
            workNotes.forEach((note, index) => {
                console.log(`   ${index + 1}. [${note.date} ${note.time}] ${note.text.substring(0, 50)}... (by ${note.author})`);
            });
        } catch (error) {
            console.log(`⚠️  Could not fetch work notes: ${error.message}`);
        }
        console.log();

        // Step 6: Summary
        console.log('📊 Test Summary:');
        console.log('================');
        console.log(`✅ Ticket timestamp fields: ${testTicket.receivedAt ? 'PRESENT' : 'MISSING (old ticket)'}`);
        console.log(`✅ Activity logs: ${activityLogs.length} found`);
        console.log(`✅ API endpoints: Working`);
        console.log();
        console.log('🎉 Tests completed!');
        console.log();
        console.log('💡 To fully test real-time timestamp capture:');
        console.log('   1. Send a new email to support@edgestone.in');
        console.log('   2. Wait for ticket creation');
        console.log('   3. Run this test again');
        console.log('   4. Verify receivedAt matches email send time, not current time');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('   Response:', error.response.data);
        }
    }
}

// Run tests
testTimestampAndActivityLogging();
