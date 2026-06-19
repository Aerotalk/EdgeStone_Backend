const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const roadmapController = require('../controllers/roadmapController');

router.get('/',roadmapController.getRoadmap);
router.post('/analyze',roadmapController.analyzeRoadmap);

module.exports = router;
