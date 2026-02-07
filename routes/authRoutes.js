const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, requireSuperAdmin } = require('../middlewares/authMiddleware');

router.post('/login', authController.login);

// Test route to verify superadmin access
router.get('/superadmin-test', protect, requireSuperAdmin, (req, res) => {
    res.json({ message: 'Welcome Super Admin', user: req.user });
});

module.exports = router;
