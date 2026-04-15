const express = require('express');
const router = express.Router();
const circuitController = require('../controllers/circuitController');
const { protect } = require('../middlewares/authMiddleware');

// Get all circuits
router.get('/',     protect, circuitController.getCircuits);

// Create a new circuit
router.post('/',    protect, circuitController.createCircuit);

// Update an existing circuit
router.put('/:id',  protect, circuitController.updateCircuit);

module.exports = router;
