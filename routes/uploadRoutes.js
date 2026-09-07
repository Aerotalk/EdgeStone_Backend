const express = require('express');
const router = express.Router();
const { 
    SIZE_LIMITS,
    uploadProfile, 
    uploadDocument, 
    uploadAttachment,
    handleMulterUpload,
    uploadProfilePictureHandler, 
    uploadDocumentHandler,
    uploadAttachmentHandler,
    downloadAttachmentHandler
} = require('../controllers/uploadController');
const { protect } = require('../middlewares/authMiddleware'); 

// Endpoint to inspect size limits
router.get('/limits', (req, res) => {
    res.json({
        success: true,
        limits: {
            profileMaxBytes: SIZE_LIMITS.PROFILE,
            profileMaxMb: SIZE_LIMITS.PROFILE / (1024 * 1024),
            documentMaxBytes: SIZE_LIMITS.DOCUMENT,
            documentMaxMb: SIZE_LIMITS.DOCUMENT / (1024 * 1024),
            attachmentMaxBytes: SIZE_LIMITS.ATTACHMENT,
            attachmentMaxMb: SIZE_LIMITS.ATTACHMENT / (1024 * 1024),
            maxAttachmentFiles: SIZE_LIMITS.MAX_ATTACHMENT_FILES,
            emailAttachmentMaxBytes: SIZE_LIMITS.EMAIL_ATTACHMENT,
            emailAttachmentMaxMb: SIZE_LIMITS.EMAIL_ATTACHMENT / (1024 * 1024)
        }
    });
});

// Upload routes with error handling wrappers
router.post('/profile', handleMulterUpload(uploadProfile.single('file'), '5MB'), uploadProfilePictureHandler);
router.post('/document', handleMulterUpload(uploadDocument.single('file'), '20MB'), uploadDocumentHandler);
router.post('/attachments', handleMulterUpload(uploadAttachment.array('files', SIZE_LIMITS.MAX_ATTACHMENT_FILES), '20MB per file'), uploadAttachmentHandler);

// Streaming download route for attachments (accessible to agents)
router.get('/attachments/:filename/download', downloadAttachmentHandler);

module.exports = router;

