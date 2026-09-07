const express = require('express');
const router = express.Router();
const {
    getAllVendors,
    getVendorById,
    createVendor,
    updateVendor,
    deleteVendor
} = require('../controllers/vendorController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', protect, authorize('Manager', 'Support crew'), getAllVendors);
router.get('/:id', protect, authorize('Manager', 'Support crew'), getVendorById);
router.post('/', protect, authorize('Manager'), createVendor);
router.put('/:id', protect, authorize('Manager'), updateVendor);
router.delete('/:id', protect, authorize('Manager', 'Support crew'), deleteVendor);

module.exports = router;
