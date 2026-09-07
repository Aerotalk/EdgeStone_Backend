const express = require('express');
const router = express.Router();
const {
    getAllClients,
    getClientById,
    createClient,
    updateClient,
    deleteClient
} = require('../controllers/clientController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', protect, authorize('Manager', 'Support crew'), getAllClients);
router.get('/:id', protect, authorize('Manager', 'Support crew'), getClientById);
router.post('/', protect, authorize('Manager'), createClient);
router.put('/:id', protect, authorize('Manager'), updateClient);
router.delete('/:id', protect, authorize('Manager', 'Support crew'), deleteClient);

module.exports = router;
