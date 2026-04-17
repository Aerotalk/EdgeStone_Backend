const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { protect, requireSuperAdmin } = require('../middlewares/authMiddleware');

// All routes are protected and require Super Admin access
router.use(protect);
router.use(requireSuperAdmin);

router.post('/', agentController.createAgent);
router.get('/', agentController.getAgents);
router.get('/:id', agentController.getAgentById);
router.put('/:id', agentController.updateAgent);

module.exports = router;
