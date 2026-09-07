'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');

async function runTests() {
    console.log('====================================================');
    console.log('🧪 TESTING ATTACHMENT SIZE LIMITS & DOWNLOAD SYSTEM');
    console.log('====================================================\n');

    let passed = 0;
    let total = 0;

    function assert(cond, msg) {
        total++;
        if (cond) {
            console.log(`  ✅ PASS: ${msg}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${msg}`);
            throw new Error(`Assertion failed: ${msg}`);
        }
    }

    // 1. Verify uploadController.SIZE_LIMITS exported constants
    console.log('--- Test 1: SIZE_LIMITS Constant Verification ---');
    const { SIZE_LIMITS } = require('../controllers/uploadController');
    assert(SIZE_LIMITS.PROFILE === 5 * 1024 * 1024, 'Profile limit is 5MB');
    assert(SIZE_LIMITS.DOCUMENT === 20 * 1024 * 1024, 'Document limit is 20MB');
    assert(SIZE_LIMITS.ATTACHMENT === 20 * 1024 * 1024, 'Attachment limit is 20MB');
    assert(SIZE_LIMITS.MAX_ATTACHMENT_FILES === 10, 'Max attachment files is 10');
    assert(SIZE_LIMITS.EMAIL_ATTACHMENT === 25 * 1024 * 1024, 'Email attachment limit is 25MB');

    // 2. Test downloadAttachmentHandler logic
    console.log('\n--- Test 2: Dedicated Streaming Download Handler ---');
    const { downloadAttachmentHandler } = require('../controllers/uploadController');

    // Test path traversal protection
    let traversalBlocked = false;
    const reqMockTraversal = {
        params: { filename: '../../etc/passwd' },
        query: {}
    };
    const resMockTraversal = {
        status: function(code) {
            if (code === 400) traversalBlocked = true;
            return this;
        },
        json: function(data) {
            assert(data.success === false, 'Traversal attempt returns success: false');
        }
    };
    downloadAttachmentHandler(reqMockTraversal, resMockTraversal);
    assert(traversalBlocked, 'Path traversal attempt blocked with HTTP 400');

    // Test missing file 404
    let notFoundTriggered = false;
    const reqMockMissing = {
        params: { filename: 'non_existent_file_123456.pdf' },
        query: {}
    };
    const resMockMissing = {
        status: function(code) {
            if (code === 404) notFoundTriggered = true;
            return this;
        },
        json: function(data) {
            assert(data.success === false, 'Missing file returns success: false');
        }
    };
    downloadAttachmentHandler(reqMockMissing, resMockMissing);
    assert(notFoundTriggered, 'Missing file returns HTTP 404');

    // Test real file download with res.download
    const testDir = path.join(__dirname, '../uploads/attachments');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const testFileName = `test-download-${Date.now()}.txt`;
    const testFilePath = path.join(testDir, testFileName);
    fs.writeFileSync(testFilePath, 'Hello EdgeStone Attachment Download Test!');

    let downloadCalled = false;
    let downloadedPath = null;
    let downloadedName = null;

    const reqMockValid = {
        params: { filename: testFileName },
        query: { name: 'Customer_Report.txt' }
    };
    const resMockValid = {
        download: function(filePath, filename, cb) {
            downloadCalled = true;
            downloadedPath = filePath;
            downloadedName = filename;
            if (cb) cb(null);
        }
    };
    downloadAttachmentHandler(reqMockValid, resMockValid);
    assert(downloadCalled, 'res.download called for valid attachment file');
    assert(downloadedName === 'Customer_Report.txt', 'Preserves original customer file name in Content-Disposition');

    // Clean up test file
    try { fs.unlinkSync(testFilePath); } catch (e) {}

    // 3. Test ticketService initial reply attachments preservation
    console.log('\n--- Test 3: Incoming Email Initial Attachments Preservation ---');
    const ticketService = require('../services/ticketService');
    const TicketModel = require('../models/ticket');

    // Mock TicketModel.createTicket to capture the data passed to it
    const origCreateTicket = TicketModel.createTicket;
    let capturedCreateData = null;
    TicketModel.createTicket = async (data) => {
        capturedCreateData = data;
        return {
            id: 'mock-ticket-uuid',
            ticketId: data.ticketId,
            header: data.header,
            replies: [
                {
                    text: data.replies.create.text,
                    attachments: data.replies.create.attachments
                }
            ],
            receivedTime: data.receivedTime
        };
    };

    try {
        // Also mock findExistingTicketForReply to return null (new ticket)
        // and Prisma circuit lookups
        const prisma = require('../models/index');
        const origFindMany = prisma.circuit.findMany;
        prisma.circuit.findMany = async () => [
            {
                id: 'ckt-uuid-1',
                customerCircuitId: 'TEST-CKT-001',
                clientId: 'test-client-id',
                vendorId: null
            }
        ];

        const mockEmailData = {
            from: 'customer@clientcorp.com',
            fromName: 'Jane Client',
            to: ['support@edgestone.in'],
            subject: 'Fiber Down TEST-CKT-001 with Diagnostics',
            body: 'Please see attached diagnostic logs and screenshots.',
            date: new Date().toISOString(),
            messageId: `<msg-test-att-${Date.now()}@clientcorp.com>`,
            attachments: [
                {
                    url: 'http://localhost:5000/uploads/attachments/email-diag-123.pdf',
                    downloadUrl: 'http://localhost:5000/api/upload/attachments/email-diag-123.pdf/download?name=Diagnostics.pdf',
                    originalName: 'Diagnostics.pdf',
                    filename: 'email-diag-123.pdf',
                    mimeType: 'application/pdf',
                    size: 1542000
                },
                {
                    url: 'http://localhost:5000/uploads/attachments/email-screen-456.png',
                    downloadUrl: 'http://localhost:5000/api/upload/attachments/email-screen-456.png/download?name=Screenshot.png',
                    originalName: 'Screenshot.png',
                    filename: 'email-screen-456.png',
                    mimeType: 'image/png',
                    size: 524000
                }
            ]
        };

        const resultTicket = await ticketService.createTicketFromEmail(mockEmailData);
        assert(capturedCreateData !== null, 'TicketModel.createTicket was invoked');
        assert(
            capturedCreateData.replies &&
            capturedCreateData.replies.create &&
            Array.isArray(capturedCreateData.replies.create.attachments),
            'createTicket passed attachments array into initial reply'
        );
        assert(
            capturedCreateData.replies.create.attachments.length === 2,
            'All 2 email attachments preserved on the ticket reply'
        );
        assert(
            capturedCreateData.replies.create.attachments[0].originalName === 'Diagnostics.pdf',
            'First attachment originalName intact'
        );
        assert(
            capturedCreateData.replies.create.attachments[1].originalName === 'Screenshot.png',
            'Second attachment originalName intact'
        );

        // Restore mocks
        prisma.circuit.findMany = origFindMany;
    } finally {
        TicketModel.createTicket = origCreateTicket;
    }

    console.log(`\n====================================================`);
    console.log(`🎉 ALL TESTS PASSED: ${passed}/${total}`);
    console.log(`====================================================`);
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
});
