const express = require('express');
const router = express.Router();
const { 
    uploadProfile, 
    uploadDocument, 
    uploadAttachment,
    uploadProfilePictureHandler, 
    uploadDocumentHandler,
    uploadAttachmentHandler
} = require('../controllers/uploadController');
const { protect } = require('../middlewares/authMiddleware'); 

// Optionally you can require auth for uploads:
// router.use(protect);

router.post('/profile', uploadProfile.single('file'), uploadProfilePictureHandler);
router.post('/document', uploadDocument.single('file'), uploadDocumentHandler);
router.post('/attachments', uploadAttachment.array('files', 10), uploadAttachmentHandler);

module.exports = router;
