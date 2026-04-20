const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const workNoteController = require('../controllers/workNoteController');
const activityLogController = require('../controllers/activityLogController');

const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, ticketController.getTickets);
router.post('/', protect, ticketController.createTicket);
router.patch('/:id', protect, ticketController.updateTicket); // Update ticket
router.patch('/:id/sla-toggle', protect, ticketController.toggleSla);
router.post('/:id/reply', protect, ticketController.replyTicket);
router.get('/:id/vendor-emails', protect, ticketController.getVendorEmails);
router.post('/:id/vendor-reply', protect, ticketController.replyVendorTicket);

// Work Notes routes
router.post('/:ticketId/work-notes', protect, workNoteController.createWorkNote);
router.get('/:ticketId/work-notes', protect, workNoteController.getWorkNotes);

// Activity Logs routes
router.get('/:ticketId/activity-logs', protect, activityLogController.getActivityLogs);

module.exports = router;
