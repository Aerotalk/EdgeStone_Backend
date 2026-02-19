// Test script for ticket workflow endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Test credentials (use valid credentials from your system)
const TEST_EMAIL = 'it@edgestone.in';
const TEST_PASSWORD = 'password'; // Replace with actual password

let authToken = '';

async function login() {
    try {
        const response = await axios.post(`${BASE_URL}/auth/login`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        authToken = response.data.token;
        console.log('✅ Login successful');
        return true;
    } catch (error) {
        console.error('❌ Login failed:', error.response?.data || error.message);
        return false;
    }
}

async function testGetCircuits() {
    try {
        const response = await axios.get(`${BASE_URL}/circuits`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log('✅ GET /api/circuits successful');
        console.log(`   Found ${response.data.length} circuits`);
        console.log('   Sample:', response.data[0]);
        return response.data;
    } catch (error) {
        console.error('❌ GET /api/circuits failed:', error.response?.data || error.message);
        return null;
    }
}

async function testUpdateTicket(ticketId, updates) {
    try {
        const response = await axios.patch(`${BASE_URL}/tickets/${ticketId}`, updates, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log('✅ PATCH /api/tickets/:id successful');
        console.log('   Updated ticket:', response.data.ticket);
        return response.data.ticket;
    } catch (error) {
        console.error('❌ PATCH /api/tickets/:id failed:', error.response?.data || error.message);
        return null;
    }
}

async function runTests() {
    console.log('\n🧪 Starting Ticket Workflow Tests\n');
    console.log('='.repeat(50));

    // Test 1: Login
    console.log('\n📝 Test 1: Login');
    const loginSuccess = await login();
    if (!loginSuccess) {
        console.log('\n❌ Tests aborted - login failed');
        return;
    }

    // Test 2: Get Circuits
    console.log('\n📝 Test 2: Get Circuits');
    const circuits = await testGetCircuits();

    // Test 3: Update Ticket (requires a valid ticket ID)
    console.log('\n📝 Test 3: Update Ticket (Status Transition)');
    console.log('   Note: Replace TICKET_ID with actual ticket ID from your system');
    // Uncomment and replace with actual ticket ID:
    // await testUpdateTicket('TICKET_ID', {
    //     circuitId: circuits[0]?.id,
    //     priority: 'High'
    // });

    console.log('\n' + '='.repeat(50));
    console.log('✅ Tests completed\n');
}

runTests();
