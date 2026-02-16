const express = require('express');
const router = express.Router();
const circuitController = require('../controllers/circuitController');
const { protect } = require('../middlewares/authMiddleware');

// Get all circuits (for dropdown population)
router.get('/', protect, circuitController.getCircuits);

module.exports = router;
