const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authMiddleware');
const roadmapController = require('../controllers/roadmapController');

router.get('/', authenticateToken, roadmapController.getRoadmap);

module.exports = router;
