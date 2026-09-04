const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const roadmapController = require('../controllers/roadmapController');

router.get('/',roadmapController.getRoadmap);
module.exports = router;
