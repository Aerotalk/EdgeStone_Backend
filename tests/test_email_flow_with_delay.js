const dotenv = require('dotenv');
dotenv.config();

const emailService = require('../services/emailService');
const logger = require('../utils/logger');

/**
 * Test Email Flow with 30-second Auto-Reply Delay
 * 
 * This script tests:
 * 1. Email sending functionality
 * 2. Email threading headers (In-Reply-To, References)
 * 3. Simulates the 30-second delay behavior
 */

async function testEmailFlow() {
    logger.info('🧪 Starting Email Flow Test...');

    try {
        // Test 1: Send a basic email
        logger.info('\n📧 Test 1: Sending basic email...');
        await emailService.sendEmail({
            to: 'priyanshu@aerotalk.in', // Test email
            subject: 'Test Email - Basic',
            html: '<p>This is a test email from the EdgeStone ticketing system.</p>',
            text: 'This is a test email from the EdgeStone ticketing system.'
        });
        logger.info('✅ Test 1 passed: Basic email sent successfully');

        // Test 2: Send email with threading headers
        logger.info('\n📧 Test 2: Sending email with threading headers...');
        const mockMessageId = '<test-message-id-12345@edgestone.in>';
        await emailService.sendEmail({
            to: 'priyanshu@aerotalk.in',
            subject: 'Re: Test Email - Threading',
            html: '<p>This is a reply with threading headers.</p>',
            text: 'This is a reply with threading headers.',
            inReplyTo: mockMessageId,
            references: mockMessageId
        });
        logger.info('✅ Test 2 passed: Email with threading headers sent successfully');

        // Test 3: Simulate 30-second delayed auto-reply
        logger.info('\n⏰ Test 3: Simulating 30-second delayed auto-reply...');
        logger.info('⏰ Scheduling email to be sent in 5 seconds (simulating delay)...');

        setTimeout(async () => {
            try {
                await emailService.sendEmail({
                    to: 'priyanshu@aerotalk.in',
                    subject: 'Ticket Received: #TEST-001 - Test Ticket',
                    html: `
                        <div style="font-family: Arial, sans-serif; color: #333;">
                            <p>Thank you for reaching out to us. We have received your ticket and our team will get back to you as soon as possible.</p>
                            <p>Please note that this is an automated response and this email box is not be monitored.</p>
                            <br/>
                            <p>Sorry for Inconvenience.</p>
                            <hr/>
                            <p style="font-size: 12px; color: #666;">EdgeStone Support Team</p>
                        </div>
                    `,
                    text: 'Thank you for reaching out to us. We have received your ticket and our team will get back to you as soon as possible.',
                    inReplyTo: mockMessageId,
                    references: mockMessageId
                });
                logger.info('✅ Test 3 passed: Delayed auto-reply sent successfully');
                logger.info('\n🎉 All email flow tests completed successfully!');
            } catch (error) {
                logger.error('❌ Test 3 failed:', error);
            }
        }, 5000); // 5 seconds for testing (production uses 30 seconds)

        logger.info('⏰ Waiting for delayed email to be sent...');

    } catch (error) {
        logger.error('❌ Email flow test failed:', error);
        throw error;
    }
}

// Run the test
if (require.main === module) {
    testEmailFlow().catch(error => {
        logger.error('Test failed with error:', error);
        process.exit(1);
    });
}

module.exports = { testEmailFlow };
