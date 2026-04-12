const express = require('express');
const router = express.Router();
const slaRecordController = require('../controllers/slaRecordController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware.protect);

router.get('/', slaRecordController.getAllSLARecords);
router.post('/', slaRecordController.createSLARecord);
router.get('/ticket/:ticketId', slaRecordController.getSLARecordByTicketId);
router.patch('/ticket/:ticketId/closure', slaRecordController.updateSLAClosure);
router.put('/:id/status', slaRecordController.updateSLARecordStatus);

module.exports = router;
