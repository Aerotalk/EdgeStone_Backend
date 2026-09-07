const UserModel = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

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

const forgotPassword = async (email, options = {}) => {
    if (!email) {
        throw new Error('Email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    logger.info(`🔐 [AUTH] 🔑 [FORGOT-PW] Password reset requested for: ${normalizedEmail}`);

    let user = await UserModel.findUserByEmail(normalizedEmail);
    let isAgent = false;

    if (!user) {
        const agent = await require('../models/agent').findAgentByEmail(normalizedEmail);
        if (agent) {
            user = agent;
            isAgent = true;
        }
    }

    if (!user) {
        logger.warn(`🔐 [AUTH] ⚠️ [FORGOT-PW] Account not found for email: ${normalizedEmail}`);
        // Return success message to prevent user enumeration
        return {
            success: true,
            message: 'If an account exists with this email, password reset instructions have been sent.'
        };
    }

    // Sign a stateless token bound to JWT_SECRET + current passwordHash
    const resetToken = jwt.sign(
        { id: user.id, email: user.email, isAgent },
        process.env.JWT_SECRET + user.passwordHash,
        { expiresIn: '1h' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    try {
        const emailService = require('./emailService');
        await emailService.sendEmail({
            to: user.email,
            subject: 'Password Reset Request - EdgeStone Ticket Portal',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #FFFFFF;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h2 style="color: #E53E3E; margin: 0; font-size: 24px; font-weight: bold;">EdgeStone</h2>
                        <p style="color: #718096; font-size: 13px; margin-top: 4px;">Ticket & Circuit Management System</p>
                    </div>
                    <p style="color: #2D3748; font-size: 15px; margin-bottom: 12px;">Hello <strong>${user.name || 'Agent'}</strong>,</p>
                    <p style="color: #4A5568; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">We received a request to reset your password. Click the button below to set a new password for your account:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}" style="background-color: #E53E3E; color: #ffffff; padding: 14px 32px; font-weight: bold; font-size: 14px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a>
                    </div>
                    <p style="color: #718096; font-size: 12px; line-height: 1.5; margin-bottom: 16px;">This link will expire in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
                    <p style="color: #A0AEC0; font-size: 11px; word-break: break-all;">Direct Link: <a href="${resetLink}" style="color: #E53E3E;">${resetLink}</a></p>
                </div>
            `,
            text: `Password reset requested for EdgeStone Portal. Use this link within 1 hour: ${resetLink}`
        });
        logger.info(`🔐 [AUTH] 📧 Password reset email successfully sent to ${user.email}`);
    } catch (emailErr) {
        logger.warn(`🔐 [AUTH] ⚠️ Email dispatch failed (${emailErr.message}). Reset link: ${resetLink}`);
    }

    return {
        success: true,
        message: 'If an account exists with this email, password reset instructions have been sent.',
        // Expose resetLink in test/dev environments or when explicitly requested programmatically
        ...(process.env.NODE_ENV !== 'production' || options.returnToken ? { resetToken, resetLink } : {})
    };
};

const resetPassword = async (email, token, newPassword) => {
    if (!email || !token || !newPassword) {
        throw new Error('Email, reset token, and new password are required');
    }

    if (newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long');
    }

    const normalizedEmail = email.trim().toLowerCase();
    logger.info(`🔐 [AUTH] 🔄 [RESET-PW] Attempting password reset for: ${normalizedEmail}`);

    let user = await UserModel.findUserByEmail(normalizedEmail);
    let isAgent = false;

    if (!user) {
        const agent = await require('../models/agent').findAgentByEmail(normalizedEmail);
        if (agent) {
            user = agent;
            isAgent = true;
        }
    }

    if (!user) {
        logger.warn(`🔐 [AUTH] ❌ [RESET-PW] User not found: ${normalizedEmail}`);
        throw new Error('Invalid or expired password reset link');
    }

    // Verify token with secret + current passwordHash
    try {
        jwt.verify(token, process.env.JWT_SECRET + user.passwordHash);
    } catch (jwtErr) {
        logger.warn(`🔐 [AUTH] ❌ [RESET-PW] Token verification failed: ${jwtErr.message}`);
        throw new Error('Invalid or expired password reset link');
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    if (isAgent) {
        await require('../models/agent').updateAgent(user.id, { passwordHash: newPasswordHash });
    } else {
        await UserModel.updateUser(user.id, { passwordHash: newPasswordHash });
    }

    logger.info(`🔐 [AUTH] ✅ [RESET-PW] Password updated successfully for ${normalizedEmail}`);

    return {
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.'
    };
};

module.exports = {
    login,
    forgotPassword,
    resetPassword
};
