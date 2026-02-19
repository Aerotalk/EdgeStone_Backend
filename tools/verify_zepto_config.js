require('dotenv').config();
const { SendMailClient } = require('zeptomail');

const runTest = async () => {
    console.log('🔍 Testing ZeptoMail Configuration...');

    let url = process.env.ZEPTO_API_URL || "https://api.zeptomail.in/v1.1/email";
    const token = process.env.ZEPTO_MAIL_TOKEN;
    const fromEmail = process.env.ZEPTO_FROM_EMAIL;

    if (!token) {
        console.error('❌ Error: ZEPTO_MAIL_TOKEN is missing in .env');
        process.exit(1);
    }

    if (!fromEmail) {
        console.error('❌ Error: ZEPTO_FROM_EMAIL is missing in .env');
        process.exit(1);
    }

    // console.log(`✅ Config: URL=${url}`);

    console.log(`✅ Config: From=${fromEmail}`);
    console.log(`✅ Config: Token=${token ? token.substring(0, 20) + '...' : 'MISSING'}`);

    let client;
    try {
        client = new SendMailClient({
            url,
            // token: cleanToken, // Try clean token? Or original?
            // Revert: Use token with prefix.
            token,
        });
        console.log('✅ ZeptoMail Client initialized.');
    } catch (initError) {
        console.error('❌ Failed to initialize ZeptoMail Client:', initError.message);
        console.error(initError);
        process.exit(1);
    }

    try {
        console.log('📤 Attempting to send test email...');
        const result = await client.sendMail({
            from: {
                // address: "marketing@edgestone.in", // Use likely verified email
                // Revert to fromEmail from env but maybe keep marketing if noreply is not verified?
                // The screenshot used 'noreply@edgestone.in'.
                // If I use marketing@edgestone.in, it might work if that is verified.
                // Let's try marketing@edgestone.in (hardcoded for now)
                // address: "noreply@edgestone.in", 
                address: fromEmail,
                name: "EdgeStone Test"
            },
            to: [
                {
                    email_address: {
                        address: "it@edgestone.in", // Use verified domain address
                        name: "Test Recipient"
                    }
                }
            ],
            subject: "Test Email from ZeptoMail Integration",
            htmlbody: "<h1>It Works!</h1><p>ZeptoMail integration is successful.</p>",
        });
        console.log('✅ Email sent successfully!');
        console.log('Response:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Failed to send email.');
        console.log('Error Raw:', error); // Use log to get full structure
        if (error.response) {
            console.log('API Response Raw:', error.response.data);
        }
    }
};

runTest();
