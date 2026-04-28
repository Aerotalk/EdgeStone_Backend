const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, requireSuperAdmin } = require('../middlewares/authMiddleware');

router.post('/login', authController.login);

// Get current authenticated user
router.get('/me', protect, authController.getMe);

// Update current user's profile picture
router.put('/profile-picture', protect, authController.updateProfilePicture);

// Test route to verify superadmin access
router.get('/superadmin-test', protect, requireSuperAdmin, (req, res) => {
    res.json({ message: 'Welcome Super Admin', user: req.user });
});

module.exports = router;
