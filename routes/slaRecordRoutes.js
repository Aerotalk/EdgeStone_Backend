const express = require('express');
const router = express.Router();
const slaRecordController = require('../controllers/slaRecordController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware.protect);

router.get('/', slaRecordController.getAllSLARecords);
router.get('/export', slaRecordController.exportSLARecords);
router.post('/', slaRecordController.createSLARecord);
router.get('/ticket/:ticketId', slaRecordController.getSLARecordsByTicketId);
router.patch('/:id/closure', slaRecordController.updateSLAClosure);
router.put('/:id/manual-update', slaRecordController.manualUpdate);
router.put('/:id/status', slaRecordController.updateSLARecordStatus);

module.exports = router;
