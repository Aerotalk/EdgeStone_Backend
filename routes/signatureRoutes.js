'use strict';

const express = require('express');
const router = express.Router();
const signatureController = require('../controllers/signatureController');

// ─────────────────────────────────────────────────────────────────────────────
// Multer config — store image in memory, limit to 5MB
// Multer v2 ships as an ES module; in CommonJS require() returns { default: fn }.
// The fallback handles both v1 (direct function) and v2 (wrapped in .default).
// ─────────────────────────────────────────────────────────────────────────────
let upload = null;
try {
    const multerImport = require('multer');
    const multerFn = multerImport.default ?? multerImport;
    const memStorage = multerFn.memoryStorage ? multerFn.memoryStorage() : multerImport.memoryStorage();
    upload = multerFn({
        storage: memStorage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
        fileFilter: (_req, file, cb) => {
            const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error(`Unsupported image type: ${file.mimetype}`), false);
            }
        },
    });
} catch (err) {
    console.warn('⚠️ Multer not available for image upload route:', err.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: specific routes (like /upload-image) MUST come BEFORE /:id
// otherwise Express will match "upload-image" as an :id value.
// ─────────────────────────────────────────────────────────────────────────────

// Image upload — placed first to avoid /:id matching "upload-image"
router.post('/upload-image', (req, res, next) => {
    if (!upload) {
        return res.status(503).json({ error: 'Image upload via backend is not available. Images are embedded client-side.' });
    }
    upload.single('image')(req, res, next);
}, signatureController.uploadImage);

// CRUD
router.get('/', signatureController.getSignatures);
router.post('/', signatureController.createSignature);
router.put('/:id/set-default', signatureController.setDefault);   // specific before generic
router.put('/:id', signatureController.updateSignature);
router.delete('/:id', signatureController.deleteSignature);

module.exports = router;

