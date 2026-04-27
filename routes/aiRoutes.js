const express = require('express');
const router = express.Router();
const { processChat, extractSLAStart } = require('../controllers/aiController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/chat', protect, processChat);
router.post('/extract-sla-start/:ticketId', protect, extractSLAStart);

module.exports = router;
