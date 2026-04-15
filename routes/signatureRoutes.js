'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const signatureController = require('../controllers/signatureController');

// ─────────────────────────────────────────────────────────────────────────────
// Multer config — store image in memory, limit to 5MB
// Supports: JPEG, PNG, GIF, WebP, SVG
// ─────────────────────────────────────────────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
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

// CRUD
router.get('/', signatureController.getSignatures);
router.post('/', signatureController.createSignature);
router.put('/:id', signatureController.updateSignature);
router.delete('/:id', signatureController.deleteSignature);
router.put('/:id/set-default', signatureController.setDefault);

// Image upload (returns base64 data URL)
router.post('/upload-image', upload.single('image'), signatureController.uploadImage);

module.exports = router;
