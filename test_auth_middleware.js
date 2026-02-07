const authService = require('./services/authService');
const UserModel = require('./models/user');
const { protect } = require('./middlewares/authMiddleware');
const prisma = require('./models/index');

// Mock req, res, next
const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
};

async function testMiddleware() {
    try {
        console.log('Logging in to get token...');
        const loginData = await authService.login('it@edgestone.in', 'i@edgestone123');
        const token = loginData.token;
        console.log('Token obtained.');

        const req = {
            headers: {
                authorization: `Bearer ${token}`
            }
        };
        const res = mockRes();
        const next = (err) => {
            if (err) console.error('Next called with error:', err);
            else console.log('Next called successfully. Middleware passed.');
        };

        console.log('Testing protect middleware...');
        await protect(req, res, next);

        if (req.user) {
            console.log('User attached to req:', req.user.email);
            if (!req.user.passwordHash) {
                console.log('Password hash correctly removed.');
            } else {
                console.error('Password hash still present!');
            }
        } else {
            console.error('Req.user not attached!');
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testMiddleware();
