const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/webhook', emailController.handleWebhook);
router.get('/suggestions', protect, emailController.getSuggestions);

module.exports = router;

