const express = require('express');
const router = express.Router();
const {
    getAllClients,
    getClientById,
    createClient,
    updateClient
} = require('../controllers/clientController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', protect, authorize('Super Admin', 'Agent'), getAllClients);
router.get('/:id', protect, authorize('Super Admin', 'Agent'), getClientById);
router.post('/', protect, authorize('Super Admin', 'Agent'), createClient);
router.put('/:id', protect, authorize('Super Admin', 'Agent'), updateClient);

module.exports = router;
