const express = require('express');
const router = express.Router();
const slaRecordController = require('../controllers/slaRecordController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware.protect);

router.get('/', slaRecordController.getAllSLARecords);
router.put('/:id/status', slaRecordController.updateSLARecordStatus);

module.exports = router;
