const express = require('express');
const router = express.Router();
const slaRuleController = require('../controllers/slaRuleController');
const authMiddleware = require('../middlewares/authMiddleware');

// Using the same general auth middleware used elsewhere in the app
router.use(authMiddleware.protect);

router.get('/', slaRuleController.getAllSLARules);
router.post('/', slaRuleController.createSLARule);
router.put('/:id', slaRuleController.updateSLARule);

module.exports = router;
