const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const roadmapController = require('../controllers/roadmapController');

router.get('/', protect, roadmapController.getRoadmap);
router.post('/analyze', protect, roadmapController.analyzeRoadmap);

module.exports = router;
