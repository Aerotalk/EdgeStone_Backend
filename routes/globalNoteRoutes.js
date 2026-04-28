const express = require('express');
const router = express.Router();
const globalNoteController = require('../controllers/globalNoteController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, globalNoteController.getGlobalNote);
router.put('/', protect, globalNoteController.updateGlobalNote);

module.exports = router;
