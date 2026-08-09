const UserModel = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const emailService = require('./emailService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const login = async (email, password) => {
    logger.info(`🔐 [AUTH] ✨ [LOGIN] 🚀 Initiating deep login sequence for email: 📧 ${email}`);

    let user = await UserModel.findUserByEmail(email);
    let isAgent = false;

    if (!user) {
        // Check if user is an agent
        const agent = await require('../models/agent').findAgentByEmail(email);
        if (agent) {
            user = agent;
            isAgent = true;
            // Use the agent's database role or fallback
            if (!user.role) user.role = agent.role || (agent.isSuperAdmin ? 'Super admin' : 'Support crew');
        } else {
            logger.warn(`⚠️ 🔐 [AUTH] 🛑 [LOGIN] ❌ Login entirely failed: User/Agent totally absent for email: 📧 ${email}`);
            throw new Error('Invalid credentials');
        }
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        logger.warn(`⚠️ 🔐 [AUTH] 🛑 [LOGIN] ❌ Login utterly failed: Incorrect password hash mismatch for user: 📧 ${email}`);
        throw new Error('Invalid credentials');
    }

    logger.info(`🔐 [AUTH] ✅ [LOGIN] 🌟 Spectacular success! Login cleared for user: 📧 ${email} (Resolved Role: 🛡️ ${user.role})`);

    const token = jwt.sign(
        { id: user.id, role: user.role, isAgent },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return { user, token };
};

const forgotPassword = async (email) => {
    logger.info(`[AUTH] Forgot password request for email: ${email}`);

    // Check if user or agent exists
    let user = await UserModel.findUserByEmail(email);
    if (!user) {
        const agent = await require('../models/agent').findAgentByEmail(email);
        if (agent) {
            user = agent;
        }
    }

    if (!user) {
        // We still return true to avoid email enumeration
        logger.warn(`[AUTH] Forgot password requested for non-existent email: ${email}`);
        return true;
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Save token
    await prisma.passwordResetToken.upsert({
        where: { email },
        update: { token, expiresAt },
        create: { email, token, expiresAt }
    });

    // Send email
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    const emailHtml = `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password.</p>
        <p>Click the link below to reset your password (valid for 1 hour):</p>
        <a href="${resetLink}">Reset Password</a>
        <p>If you did not request this, please ignore this email.</p>
    `;

    try {
        await emailService.sendEmail({
            to: email,
            subject: 'Password Reset Request',
            html: emailHtml
        });
        logger.info(`[AUTH] Password reset email sent to: ${email}`);
    } catch (error) {
        logger.error(`[AUTH] Error sending password reset email to ${email}: ${error.message}`);
        throw new Error('Failed to send reset email');
    }

    return true;
};

const resetPassword = async (token, newPassword) => {
    logger.info(`[AUTH] Reset password request with token`);

    const resetRecord = await prisma.passwordResetToken.findUnique({
        where: { token }
    });

    if (!resetRecord) {
        throw new Error('Invalid or expired token');
    }

    if (new Date() > resetRecord.expiresAt) {
        await prisma.passwordResetToken.delete({ where: { token } });
        throw new Error('Token has expired');
    }

    const email = resetRecord.email;
    const passwordHash = await bcrypt.hash(newPassword, 10);

    let updated = false;
    // Try updating agent first
    const agent = await require('../models/agent').findAgentByEmail(email);
    if (agent) {
        await prisma.agent.update({
            where: { email },
            data: { passwordHash }
        });
        updated = true;
    } else {
        const user = await UserModel.findUserByEmail(email);
        if (user) {
            await prisma.user.update({
                where: { email },
                data: { passwordHash }
            });
            updated = true;
        }
    }

    if (!updated) {
        throw new Error('User not found');
    }

    // Delete token after successful reset
    await prisma.passwordResetToken.delete({ where: { token } });
    logger.info(`[AUTH] Password successfully reset for email: ${email}`);

    return true;
};

module.exports = {
    login,
    forgotPassword,
    resetPassword
};
