const express = require('express');
const router = express.Router();
const circuitController = require('../controllers/circuitController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Get all circuits
router.get('/',     protect, authorize('Manager', 'Support crew'), circuitController.getCircuits);

// Create a new circuit
router.post('/',    protect, authorize('Manager'), circuitController.createCircuit);

// Update an existing circuit
router.put('/:id',  protect, authorize('Manager'), circuitController.updateCircuit);

// Delete a circuit
router.delete('/:id', protect, authorize('Manager', 'Support crew'), circuitController.deleteCircuit);

module.exports = router;
