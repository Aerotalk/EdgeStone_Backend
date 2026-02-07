const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// All routes are protected and require Super Admin access
// Note: 'admin' role in User table corresponds to 'super_admin' concept
router.use(protect);
router.use(authorize('Admin', 'super_admin'));

router.post('/', agentController.createAgent);
router.get('/', agentController.getAgents);
router.get('/:id', agentController.getAgentById);
router.put('/:id', agentController.updateAgent);

module.exports = router;
