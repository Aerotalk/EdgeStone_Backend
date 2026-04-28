const multer = require('multer');
const path = require('path');
const fs = require('fs');

const createDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Ensure directories exist on startup
createDir('uploads/profiles');
createDir('uploads/documents');

const createStorage = (folderName) => multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, `uploads/${folderName}/`);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadProfile = multer({
    storage: createStorage('profiles'),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const uploadDocument = multer({
    storage: createStorage('documents'),
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

const uploadProfilePictureHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    // Construct the public URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/profiles/${req.file.filename}`;
    
    res.status(200).json({
        success: true,
        message: 'Profile picture uploaded successfully',
        url: fileUrl
    });
};

const uploadDocumentHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/documents/${req.file.filename}`;
    
    res.status(200).json({
        success: true,
        message: 'Document uploaded successfully',
        url: fileUrl
    });
};

module.exports = {
    uploadProfile,
    uploadDocument,
    uploadProfilePictureHandler,
    uploadDocumentHandler
};
