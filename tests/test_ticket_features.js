const ticketService = require('../services/ticketService');
const emailService = require('../services/emailService');
const TicketModel = require('../models/ticket');
const ClientModel = require('../models/client');

// --- MOCKS ---

// Mock emailService
emailService.sendEmail = async (options) => {
    console.log('---------------------------------------------------');
    console.log('📧 [MOCK] Email Sent:');
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Body: ${options.html ? 'HTML content provided' : options.text}`);
    console.log('---------------------------------------------------');
    return { messageId: 'mock-123' };
};

// Mock TicketModel
TicketModel.findAllTickets = async () => {
    return []; // Start with no tickets
};
TicketModel.createTicket = async (data) => {
    console.log('📝 [MOCK] TicketModel.createTicket called:', data.ticketId);
    return {
        ...data,
        id: 'mock-ticket-uuid',
        createdAt: new Date(),
        updatedAt: new Date()
    };
};
TicketModel.findTicketById = async (id) => {
    // Return a mock ticket if ID matches what we expect
    if (id === '#1001' || id === 'mock-ticket-uuid') {
        return {
            id: 'mock-ticket-uuid',
            ticketId: '#1001',
            email: 'test.client@example.com',
            header: '98765432 || SF/SFO - TOK/HND-002',
            circuitId: 'SF/SFO - TOK/HND-002'
        };
    }
    return null;
};
TicketModel.addReply = async (ticketId, data) => {
    console.log('💬 [MOCK] TicketModel.addReply called for ticket:', ticketId);
    return {
        id: 'mock-reply-uuid',
        ...data
    };
};
TicketModel.findAllTickets = async () => {
    return [{ ticketId: '#1001', id: 'mock-ticket-uuid' }];
};


// Mock ClientModel
ClientModel.findAllClients = async () => {
    return [
        {
            id: 'client-1',
            name: 'Test Client',
            emails: ['test.client@example.com']
        }
    ];
};

// --- TEST RUNNER ---

const runTest = async () => {
    try {
        console.log('🧪 Starting Ticket System Integration Test (Mocked DB)...');

        // 1. Test Ticket Creation from Email with Circuit ID
        const emailData = {
            from: 'test.client@example.com',
            fromName: 'Test Client',
            subject: '98765432 || SF/SFO - TOK/HND-002',
            body: 'This is a test email reporting a link down issue.',
            date: new Date()
        };

        console.log('\n--- Test 1: Creating Ticket from Email ---');
        const ticket = await ticketService.createTicketFromEmail(emailData);

        console.log('✅ Ticket Created:', ticket.ticketId);
        console.log('Header:', ticket.header);
        console.log('Circuit ID:', ticket.circuitId);

        if (ticket.circuitId === 'SF/SFO - TOK/HND-002') {
            console.log('✅ Circuit ID correctly parsed');
        } else {
            console.error('❌ Circuit ID parsing failed!');
        }

        // 2. Test Agent Reply
        console.log('\n--- Test 2: Agent Reply ---');
        const agentName = 'Agent Smith';
        const agentEmail = 'agent.smith@edgestone.in';
        const replyMessage = 'We are looking into this issue immediately.';

        // We use the ticketId returned from step 1 (which is mocked as #1001 from createTicket logic usually, 
        // but generateTicketId likely returns #1002 given our mock findAllTickets returns 1 item).
        // Let's rely on what createTicket returns.

        // However, ticketService.replyToTicket normally looks up by ID.
        // Our mock findTicketById handles #1001. 
        // ticketService.generateTicketId uses TicketModel.findAllTickets length.

        const reply = await ticketService.replyToTicket('#1001', replyMessage, agentEmail, agentName);

        console.log('✅ Reply Created:', reply.id);
        console.log('Reply Text:', reply.text);

    } catch (error) {
        console.error('❌ Test Failed:', error);
    }
};

runTest();
