'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/signatures?agentId=xxx
// ─────────────────────────────────────────────────────────────────────────────
const getSignatures = async (req, res, next) => {
    try {
        const { agentId } = req.query;
        if (!agentId) {
            return res.status(400).json({ error: 'agentId query param is required' });
        }

        const signatures = await prisma.signature.findMany({
            where: { agentId },
            orderBy: { createdAt: 'desc' },
        });

        res.json(signatures);
    } catch (error) {
        logger.error(`❌ getSignatures error: ${error.message}`);
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/signatures
// body: { agentId, name, content, defaultFor? }
// ─────────────────────────────────────────────────────────────────────────────
const createSignature = async (req, res, next) => {
    try {
        const { agentId, name, content, defaultFor } = req.body;

        if (!agentId || !name || !content) {
            return res.status(400).json({ error: 'agentId, name, and content are required' });
        }

        // If this signature is being set as a default, clear the same defaultFor from others
        if (defaultFor) {
            await clearConflictingDefaults(agentId, defaultFor, null);
        }

        const signature = await prisma.signature.create({
            data: {
                agentId,
                name: name.trim(),
                content,
                defaultFor: defaultFor || null,
            },
        });

        logger.info(`✅ Signature created: ${signature.id} for agent ${agentId}`);
        res.status(201).json(signature);
    } catch (error) {
        logger.error(`❌ createSignature error: ${error.message}`);
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/signatures/:id
// body: { name?, content?, defaultFor? }
// ─────────────────────────────────────────────────────────────────────────────
const updateSignature = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, content, defaultFor } = req.body;

        const existing = await prisma.signature.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Signature not found' });
        }

        // Clear conflicts if defaultFor is being changed
        if (defaultFor !== undefined && defaultFor !== existing.defaultFor) {
            await clearConflictingDefaults(existing.agentId, defaultFor, id);
        }

        const updated = await prisma.signature.update({
            where: { id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(content !== undefined && { content }),
                ...(defaultFor !== undefined && { defaultFor: defaultFor || null }),
            },
        });

        logger.info(`✅ Signature updated: ${id}`);
        res.json(updated);
    } catch (error) {
        logger.error(`❌ updateSignature error: ${error.message}`);
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/signatures/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteSignature = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await prisma.signature.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Signature not found' });
        }

        await prisma.signature.delete({ where: { id } });
        logger.info(`🗑 Signature deleted: ${id}`);
        res.json({ success: true, id });
    } catch (error) {
        logger.error(`❌ deleteSignature error: ${error.message}`);
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/signatures/:id/set-default
// body: { defaultFor: "new" | "reply" | "both" | null }
// ─────────────────────────────────────────────────────────────────────────────
const setDefault = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { defaultFor } = req.body;

        const existing = await prisma.signature.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Signature not found' });
        }

        // Clear conflicting defaults for this agent
        if (defaultFor) {
            await clearConflictingDefaults(existing.agentId, defaultFor, id);
        }

        const updated = await prisma.signature.update({
            where: { id },
            data: { defaultFor: defaultFor || null },
        });

        logger.info(`✅ Default set: signature ${id} → defaultFor=${defaultFor}`);
        res.json(updated);
    } catch (error) {
        logger.error(`❌ setDefault error: ${error.message}`);
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/signatures/upload-image
// Accepts multipart/form-data with field "image"
// Returns { url: "data:image/...;base64,..." }
// ─────────────────────────────────────────────────────────────────────────────
const uploadImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        // Convert to base64 data URL so it can be embedded inline in HTML signatures
        // This works without any cloud storage dependency
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        const dataUrl = `data:${mimeType};base64,${base64}`;

        logger.info(`🖼 Signature image uploaded: ${req.file.originalname} (${req.file.size} bytes)`);

        res.json({
            url: dataUrl,
            filename: req.file.originalname,
            mimeType,
            size: req.file.size,
        });
    } catch (error) {
        logger.error(`❌ uploadImage error: ${error.message}`);
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: clears defaultFor from all OTHER signatures for the same agent
// when a given defaultFor value would conflict ("new", "reply", "both")
// ─────────────────────────────────────────────────────────────────────────────
const clearConflictingDefaults = async (agentId, newDefaultFor, excludeId) => {
    if (!newDefaultFor) return;

    const conflictingValues = (() => {
        if (newDefaultFor === 'both') return ['new', 'reply', 'both'];
        if (newDefaultFor === 'new') return ['new', 'both'];
        if (newDefaultFor === 'reply') return ['reply', 'both'];
        return [];
    })();

    await prisma.signature.updateMany({
        where: {
            agentId,
            defaultFor: { in: conflictingValues },
            ...(excludeId && { id: { not: excludeId } }),
        },
        data: { defaultFor: null },
    });
};

module.exports = {
    getSignatures,
    createSignature,
    updateSignature,
    deleteSignature,
    setDefault,
    uploadImage,
};
