const express = require('express');
const router = express.Router();
const {
    getAllVendors,
    getVendorById,
    createVendor,
    updateVendor
} = require('../controllers/vendorController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', protect, authorize('Super Admin', 'Agent'), getAllVendors);
router.get('/:id', protect, authorize('Super Admin', 'Agent'), getVendorById);
router.post('/', protect, authorize('Super Admin', 'Agent'), createVendor);
router.put('/:id', protect, authorize('Super Admin', 'Agent'), updateVendor);

module.exports = router;
