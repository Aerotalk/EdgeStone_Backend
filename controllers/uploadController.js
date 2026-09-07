const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// System-wide file size limits
const SIZE_LIMITS = {
    PROFILE: 5 * 1024 * 1024,          // 5MB limit
    DOCUMENT: 20 * 1024 * 1024,        // 20MB limit
    ATTACHMENT: 20 * 1024 * 1024,      // 20MB limit per file
    MAX_ATTACHMENT_FILES: 10,           // Max 10 files per upload batch
    EMAIL_ATTACHMENT: 25 * 1024 * 1024 // 25MB limit per incoming email attachment
};

const uploadsBaseDir = path.join(__dirname, '../uploads');
const getFolderDir = (folderName) => path.join(uploadsBaseDir, folderName);

const createDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Ensure directories exist on startup with absolute paths
createDir(getFolderDir('profiles'));
createDir(getFolderDir('documents'));
createDir(getFolderDir('attachments'));

const createStorage = (folderName) => multer.diskStorage({
    destination: function (req, file, cb) {
        const dest = getFolderDir(folderName);
        createDir(dest);
        cb(null, dest);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeName = file.originalname ? file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_') : 'file';
        cb(null, `${file.fieldname}-${uniqueSuffix}-${safeName}`);
    }
});

const uploadProfile = multer({
    storage: createStorage('profiles'),
    limits: { fileSize: SIZE_LIMITS.PROFILE }
});

const uploadDocument = multer({
    storage: createStorage('documents'),
    limits: { fileSize: SIZE_LIMITS.DOCUMENT }
});

const uploadAttachment = multer({
    storage: createStorage('attachments'),
    limits: { 
        fileSize: SIZE_LIMITS.ATTACHMENT,
        files: SIZE_LIMITS.MAX_ATTACHMENT_FILES
    }
});

// Middleware wrapper to catch Multer errors gracefully and return 400 instead of 500
const handleMulterUpload = (uploadMiddleware, limitDescription) => {
    return (req, res, next) => {
        uploadMiddleware(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({
                            success: false,
                            code: 'LIMIT_FILE_SIZE',
                            message: `File size limit exceeded. Maximum allowed size is ${limitDescription}.`
                        });
                    }
                    if (err.code === 'LIMIT_FILE_COUNT') {
                        return res.status(400).json({
                            success: false,
                            code: 'LIMIT_FILE_COUNT',
                            message: `Too many files uploaded. Maximum allowed is ${SIZE_LIMITS.MAX_ATTACHMENT_FILES} files per request.`
                        });
                    }
                    return res.status(400).json({
                        success: false,
                        code: err.code,
                        message: `Upload error: ${err.message}`
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: err.message || 'File upload failed'
                });
            }
            next();
        });
    };
};

const uploadProfilePictureHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    // Construct the public URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const fileUrl = `${protocol}://${req.get('host')}/uploads/profiles/${req.file.filename}`;
    
    res.status(200).json({
        success: true,
        message: 'Profile picture uploaded successfully',
        url: fileUrl,
        size: req.file.size
    });
};

const uploadDocumentHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const fileUrl = `${protocol}://${req.get('host')}/uploads/documents/${req.file.filename}`;
    
    res.status(200).json({
        success: true,
        message: 'Document uploaded successfully',
        url: fileUrl,
        size: req.file.size
    });
};

const uploadAttachmentHandler = (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    
    const attachments = req.files.map(file => ({
        url: `${protocol}://${host}/uploads/attachments/${file.filename}`,
        downloadUrl: `${protocol}://${host}/api/upload/attachments/${file.filename}/download?name=${encodeURIComponent(file.originalname)}`,
        originalName: file.originalname,
        filename: file.filename,
        mimeType: file.mimetype,
        size: file.size
    }));
    
    res.status(200).json({
        success: true,
        message: 'Attachments uploaded successfully',
        attachments
    });
};

// Dedicated streaming download endpoint for agents to download large attachments securely
const downloadAttachmentHandler = (req, res) => {
    try {
        const { filename } = req.params;
        const requestedName = req.query.name;

        // Prevent path traversal attacks
        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ success: false, message: 'Invalid attachment filename' });
        }

        const filePath = path.join(uploadsBaseDir, 'attachments', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Attachment file not found' });
        }

        const downloadName = requestedName 
            ? path.basename(requestedName) 
            : filename;

        // Express res.download streams large files directly with native download headers
        res.download(filePath, downloadName, (err) => {
            if (err && !res.headersSent) {
                logger.error(`Error downloading attachment ${filename}: ${err.message}`);
                res.status(500).json({ success: false, message: 'Error streaming attachment' });
            }
        });
    } catch (err) {
        logger.error(`Download attachment error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Failed to download attachment' });
    }
};

module.exports = {
    SIZE_LIMITS,
    uploadProfile,
    uploadDocument,
    uploadAttachment,
    handleMulterUpload,
    uploadProfilePictureHandler,
    uploadDocumentHandler,
    uploadAttachmentHandler,
    downloadAttachmentHandler
};

