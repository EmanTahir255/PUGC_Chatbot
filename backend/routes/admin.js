const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const emailService = require('../services/emailService');

function parseIntField(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseDecimalField(value) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function normalizeOptionalText(value) {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
}

function parseBit(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function validateDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : String(value).slice(0, 10);
}

async function recordExists(pool, table, keyColumn, keyValue) {
    const request = pool.request();
    request.input('keyValue', typeof keyValue === 'number' ? sql.Int : sql.VarChar, keyValue);
    const result = await request.query(`
        SELECT TOP 1 1 AS found
        FROM ${table}
        WHERE ${keyColumn} = @keyValue
    `);
    return result.recordset.length > 0;
}

async function ensureNotDuplicate(pool, query, bindInputs = []) {
    const request = pool.request();
    bindInputs.forEach(input => request.input(input.name, input.type, input.value));
    const result = await request.query(query);
    return result.recordset.length > 0;
}

function sendValidationError(res, errors) {
    return res.status(400).json({ error: 'Validation failed.', details: errors });
}

function normalizeRole(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizePaymentStatus(value) {
    const status = String(value || 'all').trim().toLowerCase();
    return ['all', 'pending', 'approved', 'rejected', 'cancelled'].includes(status) ? status : 'all';
}

function buildAdminPayment(record = {}) {
    return {
        paymentId: record.payment_id,
        userId: record.user_id,
        userName: record.full_name,
        userEmail: record.email,
        planId: record.plan_id,
        planCode: record.plan_code,
        planName: record.plan_name,
        durationDays: record.duration_days,
        chatLimit: record.chat_limit,
        amount: Number(record.amount),
        currency: record.currency,
        paymentMethod: record.payment_method,
        senderAccountName: record.sender_account_name,
        senderAccountNumber: record.sender_account_number,
        transactionReference: record.transaction_reference,
        proofFilePath: record.proof_file_path,
        proofOriginalName: record.proof_original_name,
        studentNote: record.student_note,
        status: record.status,
        reviewedBy: record.reviewed_by,
        reviewedByName: record.reviewed_by_name,
        reviewedAt: record.reviewed_at,
        adminNote: record.admin_note,
        submittedAt: record.submitted_at,
        createdAt: record.created_at,
        updatedAt: record.updated_at
    };
}

function buildAdminSubscription(record = {}) {
    return {
        subscriptionId: record.subscription_id,
        userId: record.user_id,
        userName: record.full_name,
        userEmail: record.email,
        planId: record.plan_id,
        planCode: record.plan_code,
        planName: record.plan_name,
        paymentId: record.payment_id,
        status: record.status,
        startedAt: record.started_at,
        expiresAt: record.expires_at,
        cancelledAt: record.cancelled_at,
        price: Number(record.price),
        currency: record.currency,
        durationDays: record.duration_days,
        chatLimit: record.chat_limit,
        createdAt: record.created_at,
        updatedAt: record.updated_at
    };
}

router.use(requireAuth, requireRole('admin'));

router.get('/users', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                user_id,
                full_name,
                email,
                role,
                is_active,
                last_login_at,
                created_at,
                updated_at
            FROM users
            ORDER BY created_at DESC, user_id DESC
        `);

        return res.json(result.recordset);
    } catch (error) {
        console.error('Admin users list error:', error);
        return res.status(500).json({ error: 'Failed to load users.' });
    }
});

router.put('/users/:id/role', async (req, res) => {
    const targetUserId = parseIntField(req.params.id);
    const nextRole = normalizeRole(req.body.role);
    const requesterUserId = Number(req.auth?.sub);

    if (!targetUserId) {
        return res.status(400).json({ error: 'A valid user id is required.' });
    }

    if (!['student', 'admin'].includes(nextRole)) {
        return res.status(400).json({ error: 'Role must be either student or admin.' });
    }

    if (targetUserId === requesterUserId) {
        return res.status(400).json({ error: 'You cannot change your own admin role from the dashboard.' });
    }

    try {
        const pool = await getPool();
        const targetResult = await pool.request()
            .input('userId', sql.Int, targetUserId)
            .query(`
                SELECT TOP 1
                    user_id,
                    full_name,
                    email,
                    role,
                    is_active,
                    last_login_at,
                    created_at,
                    updated_at
                FROM users
                WHERE user_id = @userId
            `);

        const targetUser = targetResult.recordset[0];

        if (!targetUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        if (targetUser.role === nextRole) {
            return res.json({
                message: 'User role is already set to that value.',
                user: targetUser
            });
        }

        if (targetUser.role === 'admin' && nextRole === 'student') {
            const adminCountResult = await pool.request().query(`
                SELECT COUNT(*) AS admin_count
                FROM users
                WHERE role = 'admin'
                  AND is_active = 1
            `);
            const adminCount = Number(adminCountResult.recordset[0]?.admin_count || 0);

            if (adminCount <= 1) {
                return res.status(400).json({ error: 'You cannot remove the last active admin.' });
            }
        }

        await pool.request()
            .input('userId', sql.Int, targetUserId)
            .input('role', sql.NVarChar(20), nextRole)
            .query(`
                UPDATE users
                SET role = @role
                WHERE user_id = @userId
            `);

        const refreshedResult = await pool.request()
            .input('userId', sql.Int, targetUserId)
            .query(`
                SELECT TOP 1
                    user_id,
                    full_name,
                    email,
                    role,
                    is_active,
                    last_login_at,
                    created_at,
                    updated_at
                FROM users
                WHERE user_id = @userId
            `);


        // Trigger Email and In-App Notification (non-blocking)
        const updatedUser = refreshedResult.recordset[0];
        if (updatedUser) {
            // Email
            emailService.sendUserRoleChangeEmail({
                email: updatedUser.email,
                name: updatedUser.full_name,
                newRole: nextRole
            }).catch(err => console.error('Role Change Email Error:', err.message));
        }

        return res.json({
            message: `User role updated to ${nextRole}. The user should log out and sign in again to refresh permissions.`,
            user: refreshedResult.recordset[0]
        });
    } catch (error) {
        console.error('Admin user role update error:', error);
        return res.status(500).json({ error: 'Failed to update user role.' });
    }
});

router.put('/users/:id/status', async (req, res) => {
    const targetUserId = parseIntField(req.params.id);
    const isActive = parseBit(req.body.isActive);
    const requesterUserId = Number(req.auth?.sub);

    if (!targetUserId) {
        return res.status(400).json({ error: 'A valid user id is required.' });
    }

    if (targetUserId === requesterUserId) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }

    try {
        const pool = await getPool();
        const targetResult = await pool.request()
            .input('userId', sql.Int, targetUserId)
            .query('SELECT user_id, full_name, email, role, is_active FROM users WHERE user_id = @userId');

        const targetUser = targetResult.recordset[0];
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Safety: don't deactivate the last active admin
        if (!isActive && targetUser.role === 'admin') {
            const adminCountResult = await pool.request().query("SELECT COUNT(*) AS admin_count FROM users WHERE role = 'admin' AND is_active = 1");
            const adminCount = Number(adminCountResult.recordset[0]?.admin_count || 0);
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'You cannot deactivate the last active admin.' });
            }
        }

        await pool.request()
            .input('userId', sql.Int, targetUserId)
            .input('isActive', sql.Bit, isActive ? 1 : 0)
            .query('UPDATE users SET is_active = @isActive WHERE user_id = @userId');

        // Trigger Email Notification (non-blocking)
        if (targetUser && targetUser.email) {
            emailService.sendUserAccountStatusEmail({
                email: targetUser.email,
                name: targetUser.full_name,
                status: isActive ? 'active' : 'inactive'
            }).catch(err => console.error('Status Change Email Error:', err.message));
        }

        return res.json({ message: `User account ${isActive ? 'activated' : 'deactivated'} successfully.` });
    } catch (error) {
        console.error('Admin user status update error:', error);
        return res.status(500).json({ error: error.message || 'Failed to update user status.' });
    }
});

router.delete('/users/:id', async (req, res) => {
    const targetUserId = parseIntField(req.params.id);
    const requesterUserId = Number(req.auth?.sub);

    if (!targetUserId) {
        return res.status(400).json({ error: 'A valid user id is required.' });
    }

    if (targetUserId === requesterUserId) {
        return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    let transaction;
    try {
        const pool = await getPool();

        const targetResult = await pool.request()
            .input('userId', sql.Int, targetUserId)
            .query('SELECT user_id, full_name, email, role, is_active FROM users WHERE user_id = @userId');

        const targetUser = targetResult.recordset[0];
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Safety: don't delete the last active admin
        if (targetUser.role === 'admin' && targetUser.is_active) {
            const adminCountResult = await pool.request().query("SELECT COUNT(*) AS admin_count FROM users WHERE role = 'admin' AND is_active = 1");
            const adminCount = Number(adminCountResult.recordset[0]?.admin_count || 0);
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'You cannot delete the last active admin.' });
            }
        }

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const request = new sql.Request(transaction);
        request.input('userId', sql.Int, targetUserId);

        // 1. Delete notifications
        await request.query('DELETE FROM dbo.notifications WHERE user_id = @userId');

        // 2. Delete subscriptions
        await request.query('DELETE FROM dbo.user_subscriptions WHERE user_id = @userId');

        // 3. Delete manual payments (where the user is the payer)
        await request.query('DELETE FROM dbo.manual_payments WHERE user_id = @userId');

        // 4. Update payments reviewed by this user (if any) to NULL so they don't break the FK
        await request.query('UPDATE dbo.manual_payments SET reviewed_by = NULL WHERE reviewed_by = @userId');

        // 5. Finally delete the user
        await request.query('DELETE FROM users WHERE user_id = @userId');

        await transaction.commit();

        // Trigger Email Notification (non-blocking)
        if (targetUser && targetUser.email) {
            emailService.sendUserAccountStatusEmail({
                email: targetUser.email,
                name: targetUser.full_name,
                status: 'deleted'
            }).catch(err => console.error('Deletion Email Error:', err.message));
        }

        return res.json({ message: 'User account and all related data deleted permanently.' });
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error('Admin user deletion error:', error);
        return res.status(500).json({ error: error.message || 'Failed to delete user account.' });
    }
});

router.get('/manual-payments', async (req, res) => {
    const status = normalizePaymentStatus(req.query.status);

    try {
        const pool = await getPool();
        const request = pool.request();
        let statusFilter = '';

        if (status !== 'all') {
            request.input('status', sql.NVarChar(20), status);
            statusFilter = 'WHERE p.status = @status';
        }

        const result = await request.query(`
            SELECT
                p.payment_id,
                p.user_id,
                u.full_name,
                u.email,
                p.plan_id,
                sp.plan_code,
                sp.plan_name,
                sp.duration_days,
                sp.chat_limit,
                p.amount,
                p.currency,
                p.payment_method,
                p.sender_account_name,
                p.sender_account_number,
                p.transaction_reference,
                p.proof_file_path,
                p.proof_original_name,
                p.student_note,
                p.status,
                p.reviewed_by,
                reviewer.full_name AS reviewed_by_name,
                p.reviewed_at,
                p.admin_note,
                p.submitted_at,
                p.created_at,
                p.updated_at
            FROM dbo.manual_payments p
            INNER JOIN dbo.users u ON p.user_id = u.user_id
            INNER JOIN dbo.subscription_plans sp ON p.plan_id = sp.plan_id
            LEFT JOIN dbo.users reviewer ON p.reviewed_by = reviewer.user_id
            ${statusFilter}
            ORDER BY
                CASE WHEN p.status = 'pending' THEN 0 ELSE 1 END,
                p.submitted_at DESC,
                p.payment_id DESC
        `);

        return res.json({
            payments: result.recordset.map(buildAdminPayment)
        });
    } catch (error) {
        console.error('Admin manual payment list error:', error);
        return res.status(500).json({ error: 'Failed to load manual payments.' });
    }
});

router.get('/subscriptions', async (req, res) => {
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const allowedStatuses = new Set(['all', 'active', 'expired', 'cancelled']);

    try {
        const pool = await getPool();

        await pool.request().query(`
            UPDATE dbo.user_subscriptions
            SET status = 'expired'
            WHERE status = 'active'
              AND expires_at <= GETDATE()
        `);

        const request = pool.request();
        let statusFilter = '';

        if (allowedStatuses.has(status) && status !== 'all') {
            request.input('status', sql.NVarChar(20), status);
            statusFilter = 'WHERE s.status = @status';
        }

        const result = await request.query(`
            SELECT
                s.subscription_id,
                s.user_id,
                u.full_name,
                u.email,
                s.plan_id,
                sp.plan_code,
                sp.plan_name,
                s.payment_id,
                s.status,
                s.started_at,
                s.expires_at,
                s.cancelled_at,
                sp.price,
                sp.currency,
                sp.duration_days,
                sp.chat_limit,
                s.created_at,
                s.updated_at
            FROM dbo.user_subscriptions s
            INNER JOIN dbo.users u ON s.user_id = u.user_id
            INNER JOIN dbo.subscription_plans sp ON s.plan_id = sp.plan_id
            ${statusFilter}
            ORDER BY
                CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
                s.expires_at DESC,
                s.subscription_id DESC
        `);

        return res.json({
            subscriptions: result.recordset.map(buildAdminSubscription)
        });
    } catch (error) {
        console.error('Admin subscription list error:', error);
        return res.status(500).json({ error: 'Failed to load subscriptions.' });
    }
});

router.put('/actions/cancel-subscription/:id', async (req, res) => {
    console.log('--- Cancellation Request Received ---');
    const subscriptionId = parseIntField(req.params.id);
    const cancelReason = normalizeOptionalText(req.body.reason) || 'Cancelled by administrator';

    if (!subscriptionId) {
        return res.status(400).json({ error: 'Valid subscription ID is required.' });
    }

    let transaction;
    try {
        const pool = await getPool();

        // 1. Get subscription details first
        const subResult = await pool.request()
            .input('id', sql.Int, subscriptionId)
            .query(`
                SELECT s.subscription_id, s.user_id, u.full_name, u.email, sp.plan_name, s.status
                FROM dbo.user_subscriptions s
                INNER JOIN dbo.users u ON s.user_id = u.user_id
                INNER JOIN dbo.subscription_plans sp ON s.plan_id = sp.plan_id
                WHERE s.subscription_id = @id
            `);

        const sub = subResult.recordset[0];
        if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
        if (sub.status !== 'active') return res.status(400).json({ error: `Cannot cancel: Subscription is currently ${sub.status}.` });

        // Use a transaction for the status update and notification
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // 2. Update status to cancelled
        await new sql.Request(transaction)
            .input('id', sql.Int, subscriptionId)
            .query(`
                UPDATE dbo.user_subscriptions
                SET status = 'cancelled',
                    cancelled_at = GETDATE(),
                    updated_at = GETDATE()
                WHERE subscription_id = @id
            `);

        // 3. Create in-app notification
        // Note: 'payment_rejected' is used as it's allowed by the DB constraint 'CK_notifications_type'
        await new sql.Request(transaction)
            .input('userId', sql.Int, sub.user_id)
            .input('subId', sql.Int, subscriptionId)
            .input('title', sql.NVarChar(150), 'Subscription Cancelled')
            .input('message', sql.NVarChar(1000), `Your ${sub.plan_name} subscription was cancelled by admin. Reason: ${cancelReason}`)
            .query(`
                INSERT INTO dbo.notifications (user_id, notification_type, title, message, related_subscription_id)
                VALUES (@userId, 'payment_rejected', @title, @message, @subId)
            `);

        await transaction.commit();
        transaction = null;

        // 4. Send Email (non-blocking, won't fail the transaction if email fails)
        const { sendSubscriptionCancellation } = require('../services/emailService');
        sendSubscriptionCancellation({
            email: sub.email,
            name: sub.full_name,
            reason: cancelReason,
            subscription: { planName: sub.plan_name }
        }).catch(err => console.error('Delayed Email Error:', err.message));

        return res.json({ success: true, message: 'Subscription cancelled successfully.' });
    } catch (error) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) { console.error('Rollback error:', e); }
        }
        console.error('CRITICAL: Cancel subscription error:', error);
        return res.status(500).json({
            error: 'Internal server error during cancellation.',
            details: error.message
        });
    }
});

router.put('/manual-payments/:id/approve', async (req, res) => {
    const paymentId = parseIntField(req.params.id);
    const reviewerId = Number(req.auth?.sub);
    const adminNote = normalizeOptionalText(req.body.adminNote || req.body.admin_note);
    let transaction;

    if (!paymentId) {
        return res.status(400).json({ error: 'A valid payment id is required.' });
    }

    try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const paymentResult = await new sql.Request(transaction)
            .input('paymentId', sql.Int, paymentId)
            .query(`
                SELECT TOP 1
                    p.payment_id,
                    p.user_id,
                    p.plan_id,
                    p.status,
                    p.amount,
                    p.currency,
                    sp.plan_name,
                    sp.duration_days
                FROM dbo.manual_payments p
                INNER JOIN dbo.subscription_plans sp ON p.plan_id = sp.plan_id
                WHERE p.payment_id = @paymentId
            `);

        const payment = paymentResult.recordset[0];

        if (!payment) {
            await transaction.rollback();
            transaction = null;
            return res.status(404).json({ error: 'Manual payment request not found.' });
        }

        if (payment.status !== 'pending') {
            await transaction.rollback();
            transaction = null;
            return res.status(400).json({ error: `Only pending payments can be approved. This payment is ${payment.status}.` });
        }

        await new sql.Request(transaction)
            .input('paymentId', sql.Int, paymentId)
            .input('reviewerId', sql.Int, reviewerId)
            .input('adminNote', sql.NVarChar(500), adminNote)
            .query(`
                UPDATE dbo.manual_payments
                SET status = 'approved',
                    reviewed_by = @reviewerId,
                    reviewed_at = GETDATE(),
                    admin_note = @adminNote
                WHERE payment_id = @paymentId
            `);

        await new sql.Request(transaction)
            .input('userId', sql.Int, payment.user_id)
            .query(`
                UPDATE dbo.user_subscriptions
                SET status = 'expired'
                WHERE user_id = @userId
                  AND status = 'active'
                  AND expires_at <= GETDATE()
            `);

        const existingSubscriptionResult = await new sql.Request(transaction)
            .input('userId', sql.Int, payment.user_id)
            .query(`
                SELECT TOP 1 subscription_id, expires_at
                FROM dbo.user_subscriptions
                WHERE user_id = @userId
                  AND status = 'active'
                  AND expires_at > GETDATE()
                ORDER BY expires_at DESC, subscription_id DESC
            `);

        let subscriptionId;

        if (existingSubscriptionResult.recordset[0]) {
            const updatedSubscriptionResult = await new sql.Request(transaction)
                .input('subscriptionId', sql.Int, existingSubscriptionResult.recordset[0].subscription_id)
                .input('planId', sql.Int, payment.plan_id)
                .input('paymentId', sql.Int, payment.payment_id)
                .input('durationDays', sql.Int, payment.duration_days)
                .query(`
                    UPDATE dbo.user_subscriptions
                    SET plan_id = @planId,
                        payment_id = @paymentId,
                        expires_at = DATEADD(day, @durationDays, expires_at)
                    OUTPUT inserted.subscription_id
                    WHERE subscription_id = @subscriptionId
                `);

            subscriptionId = updatedSubscriptionResult.recordset[0].subscription_id;
        } else {
            const createdSubscriptionResult = await new sql.Request(transaction)
                .input('userId', sql.Int, payment.user_id)
                .input('planId', sql.Int, payment.plan_id)
                .input('paymentId', sql.Int, payment.payment_id)
                .input('durationDays', sql.Int, payment.duration_days)
                .query(`
                    INSERT INTO dbo.user_subscriptions (
                        user_id,
                        plan_id,
                        payment_id,
                        status,
                        started_at,
                        expires_at
                    )
                    OUTPUT inserted.subscription_id
                    VALUES (
                        @userId,
                        @planId,
                        @paymentId,
                        'active',
                        GETDATE(),
                        DATEADD(day, @durationDays, GETDATE())
                    )
                `);

            subscriptionId = createdSubscriptionResult.recordset[0].subscription_id;
        }

        await new sql.Request(transaction)
            .input('userId', sql.Int, payment.user_id)
            .input('paymentId', sql.Int, payment.payment_id)
            .input('subscriptionId', sql.Int, subscriptionId)
            .input('title', sql.NVarChar(150), 'Payment approved')
            .input('message', sql.NVarChar(1000), `Your ${payment.plan_name} payment was approved. Premium access is now active.`)
            .query(`
                INSERT INTO dbo.notifications (
                    user_id,
                    notification_type,
                    title,
                    message,
                    related_payment_id,
                    related_subscription_id
                )
                VALUES (
                    @userId,
                    'payment_approved',
                    @title,
                    @message,
                    @paymentId,
                    @subscriptionId
                )
            `);

        await transaction.commit();
        transaction = null;

        const refreshedPaymentResult = await pool.request()
            .input('paymentId', sql.Int, paymentId)
            .query(`
                SELECT TOP 1
                    p.payment_id,
                    p.user_id,
                    u.full_name,
                    u.email,
                    p.plan_id,
                    sp.plan_code,
                    sp.plan_name,
                    sp.duration_days,
                    sp.chat_limit,
                    p.amount,
                    p.currency,
                    p.payment_method,
                    p.sender_account_name,
                    p.sender_account_number,
                    p.transaction_reference,
                    p.proof_file_path,
                    p.proof_original_name,
                    p.student_note,
                    p.status,
                    p.reviewed_by,
                    reviewer.full_name AS reviewed_by_name,
                    p.reviewed_at,
                    p.admin_note,
                    p.submitted_at,
                    p.created_at,
                    p.updated_at
                FROM dbo.manual_payments p
                INNER JOIN dbo.users u ON p.user_id = u.user_id
                INNER JOIN dbo.subscription_plans sp ON p.plan_id = sp.plan_id
                LEFT JOIN dbo.users reviewer ON p.reviewed_by = reviewer.user_id
                WHERE p.payment_id = @paymentId
            `);

        const refreshedSubscriptionResult = await pool.request()
            .input('subscriptionId', sql.Int, subscriptionId)
            .query(`
                SELECT TOP 1
                    s.subscription_id,
                    s.user_id,
                    u.full_name,
                    u.email,
                    s.plan_id,
                    sp.plan_code,
                    sp.plan_name,
                    s.payment_id,
                    s.status,
                    s.started_at,
                    s.expires_at,
                    s.cancelled_at,
                    sp.price,
                    sp.currency,
                    sp.duration_days,
                    sp.chat_limit,
                    s.created_at,
                    s.updated_at
                FROM dbo.user_subscriptions s
                INNER JOIN dbo.users u ON s.user_id = u.user_id
                INNER JOIN dbo.subscription_plans sp ON s.plan_id = sp.plan_id
                WHERE s.subscription_id = @subscriptionId
            `);

        // Trigger Email Notification (non-blocking)
        const subData = refreshedSubscriptionResult.recordset[0];
        if (subData && subData.email) {
            emailService.sendSubscriptionConfirmation({
                email: subData.email,
                name: subData.full_name,
                plan: { name: subData.plan_name, currency: subData.currency, price: subData.price },
                subscription: { expiresAt: subData.expires_at },
                paymentMethod: refreshedPaymentResult.recordset[0]?.payment_method || 'Manual Payment'
            }).catch(err => console.error('Approval Email Error:', err.message));
        }

        return res.json({
            message: 'Payment approved and subscription activated.',
            payment: buildAdminPayment(refreshedPaymentResult.recordset[0]),
            subscription: buildAdminSubscription(refreshedSubscriptionResult.recordset[0])
        });
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Payment approval rollback error:', rollbackError);
            }
        }

        console.error('Admin payment approval error:', error);
        return res.status(500).json({ error: 'Failed to approve payment.' });
    }
});

router.put('/manual-payments/:id/reject', async (req, res) => {
    const paymentId = parseIntField(req.params.id);
    const reviewerId = Number(req.auth?.sub);
    const adminNote = normalizeOptionalText(req.body.adminNote || req.body.admin_note) || 'Payment request rejected by admin.';
    let transaction;

    if (!paymentId) {
        return res.status(400).json({ error: 'A valid payment id is required.' });
    }

    try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const paymentResult = await new sql.Request(transaction)
            .input('paymentId', sql.Int, paymentId)
            .query(`
                SELECT TOP 1
                    p.payment_id,
                    p.user_id,
                    p.status,
                    sp.plan_name
                FROM dbo.manual_payments p
                INNER JOIN dbo.subscription_plans sp ON p.plan_id = sp.plan_id
                WHERE p.payment_id = @paymentId
            `);

        const payment = paymentResult.recordset[0];

        if (!payment) {
            await transaction.rollback();
            transaction = null;
            return res.status(404).json({ error: 'Manual payment request not found.' });
        }

        if (payment.status !== 'pending') {
            await transaction.rollback();
            transaction = null;
            return res.status(400).json({ error: `Only pending payments can be rejected. This payment is ${payment.status}.` });
        }

        await new sql.Request(transaction)
            .input('paymentId', sql.Int, paymentId)
            .input('reviewerId', sql.Int, reviewerId)
            .input('adminNote', sql.NVarChar(500), adminNote)
            .query(`
                UPDATE dbo.manual_payments
                SET status = 'rejected',
                    reviewed_by = @reviewerId,
                    reviewed_at = GETDATE(),
                    admin_note = @adminNote
                WHERE payment_id = @paymentId
            `);

        await new sql.Request(transaction)
            .input('userId', sql.Int, payment.user_id)
            .input('paymentId', sql.Int, payment.payment_id)
            .input('title', sql.NVarChar(150), 'Payment rejected')
            .input('message', sql.NVarChar(1000), `Your ${payment.plan_name} payment request was rejected. ${adminNote}`)
            .query(`
                INSERT INTO dbo.notifications (
                    user_id,
                    notification_type,
                    title,
                    message,
                    related_payment_id
                )
                VALUES (
                    @userId,
                    'payment_rejected',
                    @title,
                    @message,
                    @paymentId
                )
            `);

        await transaction.commit();
        transaction = null;

        const refreshedPaymentResult = await pool.request()
            .input('paymentId', sql.Int, paymentId)
            .query(`
                SELECT TOP 1
                    p.payment_id,
                    p.user_id,
                    u.full_name,
                    u.email,
                    p.plan_id,
                    sp.plan_code,
                    sp.plan_name,
                    sp.duration_days,
                    sp.chat_limit,
                    p.amount,
                    p.currency,
                    p.payment_method,
                    p.sender_account_name,
                    p.sender_account_number,
                    p.transaction_reference,
                    p.proof_file_path,
                    p.proof_original_name,
                    p.student_note,
                    p.status,
                    p.reviewed_by,
                    reviewer.full_name AS reviewed_by_name,
                    p.reviewed_at,
                    p.admin_note,
                    p.submitted_at,
                    p.created_at,
                    p.updated_at
                FROM dbo.manual_payments p
                INNER JOIN dbo.users u ON p.user_id = u.user_id
                INNER JOIN dbo.subscription_plans sp ON p.plan_id = sp.plan_id
                LEFT JOIN dbo.users reviewer ON p.reviewed_by = reviewer.user_id
                WHERE p.payment_id = @paymentId
            `);

        // Trigger Email Notification (non-blocking)
        const paymentData = refreshedPaymentResult.recordset[0];
        if (paymentData && paymentData.email) {
            emailService.sendSubscriptionRejection({
                email: paymentData.email,
                name: paymentData.full_name,
                planName: paymentData.plan_name,
                reason: paymentData.admin_note
            }).catch(err => console.error('Rejection Email Error:', err.message));
        }

        return res.json({
            message: 'Payment rejected.',
            payment: buildAdminPayment(refreshedPaymentResult.recordset[0])
        });
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Payment rejection rollback error:', rollbackError);
            }
        }

        console.error('Admin payment rejection error:', error);
        return res.status(500).json({ error: 'Failed to reject payment.' });
    }
});

router.get('/meta', async (req, res) => {
    try {
        const pool = await getPool();
        const [intents, departments, eventTypes, semesters, programs, feeTypes, scholarshipTypes] = await Promise.all([
            pool.request().query(`
                SELECT i.intent_id, i.intent_name, c.category_name
                FROM intents i
                JOIN categories c ON i.category_id = c.category_id
                ORDER BY i.intent_name
            `),
            pool.request().query(`
                SELECT department_id, dept_name
                FROM departments
                ORDER BY dept_name
            `),
            pool.request().query(`
                SELECT event_type_id, type_name
                FROM event_types
                ORDER BY type_name
            `),
            pool.request().query(`
                SELECT semester_id, semester_name, semester_type, year
                FROM semesters
                ORDER BY year DESC, semester_name DESC
            `),
            pool.request().query(`
                SELECT program_id, program_name, program_level, is_active
                FROM programs
                ORDER BY program_name
            `),
            pool.request().query(`
                SELECT fee_type_id, fee_type_name
                FROM fee_types
                ORDER BY fee_type_name
            `),
            pool.request().query(`
                SELECT scholarship_type_id, type_name, funding_source, is_renewable
                FROM scholarship_types
                ORDER BY type_name
            `)
        ]);

        return res.json({
            intents: intents.recordset,
            departments: departments.recordset,
            eventTypes: eventTypes.recordset,
            semesters: semesters.recordset,
            programs: programs.recordset,
            feeTypes: feeTypes.recordset,
            scholarshipTypes: scholarshipTypes.recordset
        });
    } catch (error) {
        console.error('Admin meta error:', error);
        return res.status(500).json({ error: 'Failed to load admin reference data.' });
    }
});

router.get('/faq-answers', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT fa.answer_id, fa.intent_id, fa.answer_text, fa.is_active, fa.updated_at,
                   i.intent_name, c.category_name
            FROM faq_answers fa
            JOIN intents i ON fa.intent_id = i.intent_id
            JOIN categories c ON i.category_id = c.category_id
            ORDER BY i.intent_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('FAQ list error:', error);
        return res.status(500).json({ error: 'Failed to load FAQ answers.' });
    }
});

router.post('/faq-answers', async (req, res) => {
    try {
        const pool = await getPool();
        const intentId = parseIntField(req.body.intent_id);
        const answerText = String(req.body.answer_text || '').trim();
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!intentId) errors.intent_id = 'Intent is required.';
        if (!answerText) errors.answer_text = 'Answer text is required.';
        if (intentId && !(await recordExists(pool, 'intents', 'intent_id', intentId))) {
            errors.intent_id = 'Selected intent does not exist.';
        }

        if (intentId && isActive) {
            const activeExists = await ensureNotDuplicate(pool, `
                SELECT TOP 1 1 AS found
                FROM faq_answers
                WHERE intent_id = @intentId
                  AND is_active = 1
            `, [{ name: 'intentId', type: sql.Int, value: intentId }]);
            if (activeExists) {
                errors.intent_id = 'This intent already has an active FAQ answer.';
            }
        }

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('intentId', sql.Int, intentId)
            .input('answerText', sql.NVarChar(sql.MAX), answerText)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO faq_answers (intent_id, answer_text, is_active)
                OUTPUT INSERTED.answer_id
                VALUES (@intentId, @answerText, @isActive)
            `);

        return res.status(201).json({ id: result.recordset[0].answer_id });
    } catch (error) {
        console.error('FAQ create error:', error);
        return res.status(500).json({ error: 'Failed to create FAQ answer.' });
    }
});

router.put('/faq-answers/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const answerId = parseIntField(req.params.id);
        const intentId = parseIntField(req.body.intent_id);
        const answerText = String(req.body.answer_text || '').trim();
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!answerId || !(await recordExists(pool, 'faq_answers', 'answer_id', answerId))) {
            return res.status(404).json({ error: 'FAQ answer not found.' });
        }
        if (!intentId) errors.intent_id = 'Intent is required.';
        if (!answerText) errors.answer_text = 'Answer text is required.';
        if (intentId && !(await recordExists(pool, 'intents', 'intent_id', intentId))) {
            errors.intent_id = 'Selected intent does not exist.';
        }

        if (intentId && isActive) {
            const activeExists = await ensureNotDuplicate(pool, `
                SELECT TOP 1 1 AS found
                FROM faq_answers
                WHERE intent_id = @intentId
                  AND is_active = 1
                  AND answer_id <> @answerId
            `, [
                { name: 'intentId', type: sql.Int, value: intentId },
                { name: 'answerId', type: sql.Int, value: answerId }
            ]);
            if (activeExists) {
                errors.intent_id = 'This intent already has another active FAQ answer.';
            }
        }

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('answerId', sql.Int, answerId)
            .input('intentId', sql.Int, intentId)
            .input('answerText', sql.NVarChar(sql.MAX), answerText)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE faq_answers
                SET intent_id = @intentId,
                    answer_text = @answerText,
                    is_active = @isActive,
                    updated_at = GETDATE()
                WHERE answer_id = @answerId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('FAQ update error:', error);
        return res.status(500).json({ error: 'Failed to update FAQ answer.' });
    }
});

router.delete('/faq-answers/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const answerId = parseIntField(req.params.id);
        if (!answerId || !(await recordExists(pool, 'faq_answers', 'answer_id', answerId))) {
            return res.status(404).json({ error: 'FAQ answer not found.' });
        }

        await pool.request()
            .input('answerId', sql.Int, answerId)
            .query(`
                UPDATE faq_answers
                SET is_active = 0,
                    updated_at = GETDATE()
                WHERE answer_id = @answerId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('FAQ deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate FAQ answer.' });
    }
});

router.get('/departments', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT department_id, dept_name, head_name, contact_number, email,
                   block_location, room_number, office_hours, is_active
            FROM departments
            ORDER BY dept_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Department list error:', error);
        return res.status(500).json({ error: 'Failed to load departments.' });
    }
});

router.post('/departments', async (req, res) => {
    try {
        const pool = await getPool();
        const deptName = String(req.body.dept_name || '').trim();
        const headName = normalizeOptionalText(req.body.head_name);
        const contactNumber = normalizeOptionalText(req.body.contact_number);
        const email = normalizeOptionalText(req.body.email);
        const blockLocation = normalizeOptionalText(req.body.block_location);
        const roomNumber = normalizeOptionalText(req.body.room_number);
        const officeHours = normalizeOptionalText(req.body.office_hours);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!deptName) errors.dept_name = 'Department name is required.';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email is required.';

        const duplicate = deptName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM departments
            WHERE LOWER(dept_name) = LOWER(@deptName)
        `, [{ name: 'deptName', type: sql.VarChar, value: deptName }]);
        if (duplicate) errors.dept_name = 'Department name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('deptName', sql.VarChar, deptName)
            .input('headName', sql.VarChar, headName)
            .input('contactNumber', sql.VarChar, contactNumber)
            .input('email', sql.VarChar, email)
            .input('blockLocation', sql.VarChar, blockLocation)
            .input('roomNumber', sql.VarChar, roomNumber)
            .input('officeHours', sql.VarChar, officeHours)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO departments (dept_name, head_name, contact_number, email, block_location, room_number, office_hours, is_active)
                OUTPUT INSERTED.department_id
                VALUES (@deptName, @headName, @contactNumber, @email, @blockLocation, @roomNumber, @officeHours, @isActive)
            `);

        return res.status(201).json({ id: result.recordset[0].department_id });
    } catch (error) {
        console.error('Department create error:', error);
        return res.status(500).json({ error: 'Failed to create department.' });
    }
});

router.put('/departments/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const departmentId = parseIntField(req.params.id);
        const deptName = String(req.body.dept_name || '').trim();
        const headName = normalizeOptionalText(req.body.head_name);
        const contactNumber = normalizeOptionalText(req.body.contact_number);
        const email = normalizeOptionalText(req.body.email);
        const blockLocation = normalizeOptionalText(req.body.block_location);
        const roomNumber = normalizeOptionalText(req.body.room_number);
        const officeHours = normalizeOptionalText(req.body.office_hours);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!departmentId || !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            return res.status(404).json({ error: 'Department not found.' });
        }
        if (!deptName) errors.dept_name = 'Department name is required.';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email is required.';

        const duplicate = deptName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM departments
            WHERE LOWER(dept_name) = LOWER(@deptName)
              AND department_id <> @departmentId
        `, [
            { name: 'deptName', type: sql.VarChar, value: deptName },
            { name: 'departmentId', type: sql.Int, value: departmentId }
        ]);
        if (duplicate) errors.dept_name = 'Department name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('departmentId', sql.Int, departmentId)
            .input('deptName', sql.VarChar, deptName)
            .input('headName', sql.VarChar, headName)
            .input('contactNumber', sql.VarChar, contactNumber)
            .input('email', sql.VarChar, email)
            .input('blockLocation', sql.VarChar, blockLocation)
            .input('roomNumber', sql.VarChar, roomNumber)
            .input('officeHours', sql.VarChar, officeHours)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE departments
                SET dept_name = @deptName,
                    head_name = @headName,
                    contact_number = @contactNumber,
                    email = @email,
                    block_location = @blockLocation,
                    room_number = @roomNumber,
                    office_hours = @officeHours,
                    is_active = @isActive
                WHERE department_id = @departmentId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Department update error:', error);
        return res.status(500).json({ error: 'Failed to update department.' });
    }
});

router.delete('/departments/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const departmentId = parseIntField(req.params.id);
        if (!departmentId || !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            return res.status(404).json({ error: 'Department not found.' });
        }

        const inUse = await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM programs
            WHERE department_id = @departmentId
        `, [{ name: 'departmentId', type: sql.Int, value: departmentId }]);
        if (inUse) {
            return res.status(409).json({ error: 'Department cannot be deleted while programs are linked to it.' });
        }

        await pool.request()
            .input('departmentId', sql.Int, departmentId)
            .query('DELETE FROM departments WHERE department_id = @departmentId');

        return res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Department delete error:', error);
        return res.status(500).json({ error: 'Failed to delete department.' });
    }
});

router.put('/departments/:id/status', async (req, res) => {
    try {
        const pool = await getPool();
        const departmentId = parseIntField(req.params.id);
        const isActive = parseBit(req.body.isActive);

        if (!departmentId || !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            return res.status(404).json({ error: 'Department not found.' });
        }

        await pool.request()
            .input('departmentId', sql.Int, departmentId)
            .input('isActive', sql.Bit, isActive)
            .query('UPDATE departments SET is_active = @isActive WHERE department_id = @departmentId');

        return res.json({ success: true, isActive });
    } catch (error) {
        console.error('Department status update error:', error);
        return res.status(500).json({ error: 'Failed to update department status.' });
    }
});

router.get('/programs', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT p.program_id, p.department_id, p.program_name, p.program_level, p.duration_years,
                   p.total_semesters, p.total_credit_hrs, p.total_seats, p.description, p.is_active,
                   d.dept_name
            FROM programs p
            JOIN departments d ON p.department_id = d.department_id
            ORDER BY p.program_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Program list error:', error);
        return res.status(500).json({ error: 'Failed to load programs.' });
    }
});

router.post('/programs', async (req, res) => {
    try {
        const pool = await getPool();
        const departmentId = parseIntField(req.body.department_id);
        const programName = String(req.body.program_name || '').trim();
        const programLevel = String(req.body.program_level || '').trim();
        const durationYears = parseDecimalField(req.body.duration_years);
        const totalSemesters = parseIntField(req.body.total_semesters);
        const totalCreditHrs = parseIntField(req.body.total_credit_hrs);
        const totalSeats = parseIntField(req.body.total_seats);
        const description = normalizeOptionalText(req.body.description);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!departmentId) errors.department_id = 'Department is required.';
        if (!programName) errors.program_name = 'Program name is required.';
        if (!programLevel) errors.program_level = 'Program level is required.';
        if (durationYears === null || durationYears <= 0) errors.duration_years = 'Valid duration is required.';
        if (!totalSemesters || totalSemesters <= 0) errors.total_semesters = 'Valid total semesters are required.';
        if (!totalCreditHrs || totalCreditHrs <= 0) errors.total_credit_hrs = 'Valid total credit hours are required.';
        if (!totalSeats || totalSeats <= 0) errors.total_seats = 'Valid total seats are required.';
        if (departmentId && !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            errors.department_id = 'Selected department does not exist.';
        }

        const duplicate = programName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM programs
            WHERE LOWER(program_name) = LOWER(@programName)
        `, [{ name: 'programName', type: sql.VarChar, value: programName }]);
        if (duplicate) errors.program_name = 'Program name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('departmentId', sql.Int, departmentId)
            .input('programName', sql.VarChar, programName)
            .input('programLevel', sql.VarChar, programLevel)
            .input('durationYears', sql.Decimal(3, 1), durationYears)
            .input('totalSemesters', sql.Int, totalSemesters)
            .input('totalCreditHrs', sql.Int, totalCreditHrs)
            .input('totalSeats', sql.Int, totalSeats)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO programs (
                    department_id, program_name, program_level, duration_years,
                    total_semesters, total_credit_hrs, total_seats, description, is_active
                )
                OUTPUT INSERTED.program_id
                VALUES (
                    @departmentId, @programName, @programLevel, @durationYears,
                    @totalSemesters, @totalCreditHrs, @totalSeats, @description, @isActive
                )
            `);

        return res.status(201).json({ id: result.recordset[0].program_id });
    } catch (error) {
        console.error('Program create error:', error);
        return res.status(500).json({ error: 'Failed to create program.' });
    }
});

router.put('/programs/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.params.id);
        const departmentId = parseIntField(req.body.department_id);
        const programName = String(req.body.program_name || '').trim();
        const programLevel = String(req.body.program_level || '').trim();
        const durationYears = parseDecimalField(req.body.duration_years);
        const totalSemesters = parseIntField(req.body.total_semesters);
        const totalCreditHrs = parseIntField(req.body.total_credit_hrs);
        const totalSeats = parseIntField(req.body.total_seats);
        const description = normalizeOptionalText(req.body.description);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!programId || !(await recordExists(pool, 'programs', 'program_id', programId))) {
            return res.status(404).json({ error: 'Program not found.' });
        }
        if (!departmentId) errors.department_id = 'Department is required.';
        if (!programName) errors.program_name = 'Program name is required.';
        if (!programLevel) errors.program_level = 'Program level is required.';
        if (durationYears === null || durationYears <= 0) errors.duration_years = 'Valid duration is required.';
        if (!totalSemesters || totalSemesters <= 0) errors.total_semesters = 'Valid total semesters are required.';
        if (!totalCreditHrs || totalCreditHrs <= 0) errors.total_credit_hrs = 'Valid total credit hours are required.';
        if (!totalSeats || totalSeats <= 0) errors.total_seats = 'Valid total seats are required.';
        if (departmentId && !(await recordExists(pool, 'departments', 'department_id', departmentId))) {
            errors.department_id = 'Selected department does not exist.';
        }

        const duplicate = programName && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM programs
            WHERE LOWER(program_name) = LOWER(@programName)
              AND program_id <> @programId
        `, [
            { name: 'programName', type: sql.VarChar, value: programName },
            { name: 'programId', type: sql.Int, value: programId }
        ]);
        if (duplicate) errors.program_name = 'Program name already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('programId', sql.Int, programId)
            .input('departmentId', sql.Int, departmentId)
            .input('programName', sql.VarChar, programName)
            .input('programLevel', sql.VarChar, programLevel)
            .input('durationYears', sql.Decimal(3, 1), durationYears)
            .input('totalSemesters', sql.Int, totalSemesters)
            .input('totalCreditHrs', sql.Int, totalCreditHrs)
            .input('totalSeats', sql.Int, totalSeats)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE programs
                SET department_id = @departmentId,
                    program_name = @programName,
                    program_level = @programLevel,
                    duration_years = @durationYears,
                    total_semesters = @totalSemesters,
                    total_credit_hrs = @totalCreditHrs,
                    total_seats = @totalSeats,
                    description = @description,
                    is_active = @isActive
                WHERE program_id = @programId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Program update error:', error);
        return res.status(500).json({ error: 'Failed to update program.' });
    }
});

router.delete('/programs/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.params.id);
        if (!programId || !(await recordExists(pool, 'programs', 'program_id', programId))) {
            return res.status(404).json({ error: 'Program not found.' });
        }

        await pool.request()
            .input('programId', sql.Int, programId)
            .query(`
                UPDATE programs
                SET is_active = 0
                WHERE program_id = @programId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Program deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate program.' });
    }
});

router.put('/programs/:id/status', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.params.id);
        const isActive = parseBit(req.body.isActive);

        if (!programId || !(await recordExists(pool, 'programs', 'program_id', programId))) {
            return res.status(404).json({ error: 'Program not found.' });
        }

        await pool.request()
            .input('programId', sql.Int, programId)
            .input('isActive', sql.Bit, isActive)
            .query('UPDATE programs SET is_active = @isActive WHERE program_id = @programId');

        return res.json({ success: true, isActive });
    } catch (error) {
        console.error('Program status update error:', error);
        return res.status(500).json({ error: 'Failed to update program status.' });
    }
});

router.delete('/programs/:id/permanent', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.params.id);
        if (!programId || !(await recordExists(pool, 'programs', 'program_id', programId))) {
            return res.status(404).json({ error: 'Program not found.' });
        }

        // Check dependencies (Fee structures)
        const hasFees = await ensureNotDuplicate(pool, 'SELECT TOP 1 1 as found FROM fee_structure WHERE program_id = @id', [{ name: 'id', type: sql.Int, value: programId }]);
        if (hasFees) {
            return res.status(400).json({ error: 'Cannot delete program with linked fee structures. Delete fees first.' });
        }

        await pool.request()
            .input('programId', sql.Int, programId)
            .query('DELETE FROM programs WHERE program_id = @programId');

        return res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Program permanent delete error:', error);
        return res.status(500).json({ error: 'Failed to permanently delete program.' });
    }
});

router.get('/events', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT e.event_id, e.event_type_id, e.semester_id, e.event_name, e.event_date,
                   e.event_end_date, e.venue, e.description, e.registration_required,
                   e.registration_deadline, e.is_active, et.type_name AS event_type_name,
                   sem.semester_name
            FROM events e
            JOIN event_types et ON e.event_type_id = et.event_type_id
            LEFT JOIN semesters sem ON e.semester_id = sem.semester_id
            ORDER BY e.event_date DESC, e.event_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Event list error:', error);
        return res.status(500).json({ error: 'Failed to load events.' });
    }
});

router.post('/events', async (req, res) => {
    try {
        const pool = await getPool();
        const eventTypeId = parseIntField(req.body.event_type_id);
        const semesterId = req.body.semester_id ? parseIntField(req.body.semester_id) : null;
        const eventName = String(req.body.event_name || '').trim();
        const eventDate = validateDate(req.body.event_date);
        const eventEndDate = validateDate(req.body.event_end_date);
        const venue = normalizeOptionalText(req.body.venue);
        const description = normalizeOptionalText(req.body.description);
        const registrationRequired = parseBit(req.body.registration_required, false);
        const registrationDeadline = validateDate(req.body.registration_deadline);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!eventTypeId) errors.event_type_id = 'Event type is required.';
        if (!eventName) errors.event_name = 'Event name is required.';
        if (!eventDate) errors.event_date = 'Valid event date is required.';
        if (eventTypeId && !(await recordExists(pool, 'event_types', 'event_type_id', eventTypeId))) {
            errors.event_type_id = 'Selected event type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (eventEndDate && eventDate && eventEndDate < eventDate) {
            errors.event_end_date = 'End date cannot be earlier than event date.';
        }
        if (registrationRequired && !registrationDeadline) {
            errors.registration_deadline = 'Registration deadline is required when registration is enabled.';
        }

        const duplicate = eventName && eventDate && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM events
            WHERE LOWER(event_name) = LOWER(@eventName)
              AND event_date = @eventDate
        `, [
            { name: 'eventName', type: sql.VarChar, value: eventName },
            { name: 'eventDate', type: sql.Date, value: eventDate }
        ]);
        if (duplicate) errors.event_name = 'An event with this name and date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('eventTypeId', sql.Int, eventTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('eventName', sql.VarChar, eventName)
            .input('eventDate', sql.Date, eventDate)
            .input('eventEndDate', sql.Date, eventEndDate)
            .input('venue', sql.VarChar, venue)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('registrationRequired', sql.Bit, registrationRequired)
            .input('registrationDeadline', sql.Date, registrationDeadline)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO events (
                    event_type_id, semester_id, event_name, event_date, event_end_date,
                    venue, description, registration_required, registration_deadline, is_active
                )
                OUTPUT INSERTED.event_id
                VALUES (
                    @eventTypeId, @semesterId, @eventName, @eventDate, @eventEndDate,
                    @venue, @description, @registrationRequired, @registrationDeadline, @isActive
                )
            `);

        return res.status(201).json({ id: result.recordset[0].event_id });
    } catch (error) {
        console.error('Event create error:', error);
        return res.status(500).json({ error: 'Failed to create event.' });
    }
});

router.put('/events/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const eventId = parseIntField(req.params.id);
        const eventTypeId = parseIntField(req.body.event_type_id);
        const semesterId = req.body.semester_id ? parseIntField(req.body.semester_id) : null;
        const eventName = String(req.body.event_name || '').trim();
        const eventDate = validateDate(req.body.event_date);
        const eventEndDate = validateDate(req.body.event_end_date);
        const venue = normalizeOptionalText(req.body.venue);
        const description = normalizeOptionalText(req.body.description);
        const registrationRequired = parseBit(req.body.registration_required, false);
        const registrationDeadline = validateDate(req.body.registration_deadline);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!eventId || !(await recordExists(pool, 'events', 'event_id', eventId))) {
            return res.status(404).json({ error: 'Event not found.' });
        }
        if (!eventTypeId) errors.event_type_id = 'Event type is required.';
        if (!eventName) errors.event_name = 'Event name is required.';
        if (!eventDate) errors.event_date = 'Valid event date is required.';
        if (eventTypeId && !(await recordExists(pool, 'event_types', 'event_type_id', eventTypeId))) {
            errors.event_type_id = 'Selected event type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (eventEndDate && eventDate && eventEndDate < eventDate) {
            errors.event_end_date = 'End date cannot be earlier than event date.';
        }
        if (registrationRequired && !registrationDeadline) {
            errors.registration_deadline = 'Registration deadline is required when registration is enabled.';
        }

        const duplicate = eventName && eventDate && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM events
            WHERE LOWER(event_name) = LOWER(@eventName)
              AND event_date = @eventDate
              AND event_id <> @eventId
        `, [
            { name: 'eventName', type: sql.VarChar, value: eventName },
            { name: 'eventDate', type: sql.Date, value: eventDate },
            { name: 'eventId', type: sql.Int, value: eventId }
        ]);
        if (duplicate) errors.event_name = 'An event with this name and date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('eventId', sql.Int, eventId)
            .input('eventTypeId', sql.Int, eventTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('eventName', sql.VarChar, eventName)
            .input('eventDate', sql.Date, eventDate)
            .input('eventEndDate', sql.Date, eventEndDate)
            .input('venue', sql.VarChar, venue)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('registrationRequired', sql.Bit, registrationRequired)
            .input('registrationDeadline', sql.Date, registrationDeadline)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE events
                SET event_type_id = @eventTypeId,
                    semester_id = @semesterId,
                    event_name = @eventName,
                    event_date = @eventDate,
                    event_end_date = @eventEndDate,
                    venue = @venue,
                    description = @description,
                    registration_required = @registrationRequired,
                    registration_deadline = @registrationDeadline,
                    is_active = @isActive
                WHERE event_id = @eventId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Event update error:', error);
        return res.status(500).json({ error: 'Failed to update event.' });
    }
});

router.delete('/events/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const eventId = parseIntField(req.params.id);
        if (!eventId || !(await recordExists(pool, 'events', 'event_id', eventId))) {
            return res.status(404).json({ error: 'Event not found.' });
        }

        await pool.request()
            .input('eventId', sql.Int, eventId)
            .query(`
                UPDATE events
                SET is_active = 0
                WHERE event_id = @eventId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Event deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate event.' });
    }
});

router.put('/events/:id/status', async (req, res) => {
    try {
        const pool = await getPool();
        const eventId = parseIntField(req.params.id);
        const isActive = parseBit(req.body.isActive);

        if (!eventId || !(await recordExists(pool, 'events', 'event_id', eventId))) {
            return res.status(404).json({ error: 'Event not found.' });
        }

        await pool.request()
            .input('eventId', sql.Int, eventId)
            .input('isActive', sql.Bit, isActive)
            .query('UPDATE events SET is_active = @isActive WHERE event_id = @eventId');

        return res.json({ success: true, isActive });
    } catch (error) {
        console.error('Event status update error:', error);
        return res.status(500).json({ error: 'Failed to update event status.' });
    }
});

router.delete('/events/:id/permanent', async (req, res) => {
    try {
        const pool = await getPool();
        const eventId = parseIntField(req.params.id);
        if (!eventId || !(await recordExists(pool, 'events', 'event_id', eventId))) {
            return res.status(404).json({ error: 'Event not found.' });
        }

        await pool.request()
            .input('eventId', sql.Int, eventId)
            .query('DELETE FROM events WHERE event_id = @eventId');

        return res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Event permanent delete error:', error);
        return res.status(500).json({ error: 'Failed to permanently delete event.' });
    }
});

router.get('/fee-structures', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT fs.fee_structure_id, fs.program_id, fs.fee_type_id, fs.amount, fs.effective_from, fs.effective_to,
                   p.program_name, ft.fee_type_name
            FROM fee_structure fs
            JOIN programs p ON fs.program_id = p.program_id
            JOIN fee_types ft ON fs.fee_type_id = ft.fee_type_id
            ORDER BY p.program_name, ft.fee_type_name, fs.effective_from DESC
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Fee structure list error:', error);
        return res.status(500).json({ error: 'Failed to load fee structure records.' });
    }
});

router.post('/fee-structures', async (req, res) => {
    try {
        const pool = await getPool();
        const programId = parseIntField(req.body.program_id);
        const feeTypeId = parseIntField(req.body.fee_type_id);
        const amount = parseDecimalField(req.body.amount);
        const effectiveFrom = validateDate(req.body.effective_from);
        const effectiveTo = validateDate(req.body.effective_to);
        const errors = {};

        if (!programId) errors.program_id = 'Program is required.';
        if (!feeTypeId) errors.fee_type_id = 'Fee type is required.';
        if (amount === null || amount < 0) errors.amount = 'Valid amount is required.';
        if (!effectiveFrom) errors.effective_from = 'Effective from date is required.';
        if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
            errors.effective_to = 'Effective to date cannot be earlier than effective from date.';
        }
        if (programId && !(await recordExists(pool, 'programs', 'program_id', programId))) {
            errors.program_id = 'Selected program does not exist.';
        }
        if (feeTypeId && !(await recordExists(pool, 'fee_types', 'fee_type_id', feeTypeId))) {
            errors.fee_type_id = 'Selected fee type does not exist.';
        }

        const duplicate = programId && feeTypeId && effectiveFrom && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM fee_structure
            WHERE program_id = @programId
              AND fee_type_id = @feeTypeId
              AND effective_from = @effectiveFrom
        `, [
            { name: 'programId', type: sql.Int, value: programId },
            { name: 'feeTypeId', type: sql.Int, value: feeTypeId },
            { name: 'effectiveFrom', type: sql.Date, value: effectiveFrom }
        ]);
        if (duplicate) errors.effective_from = 'A fee record for this program, fee type, and effective date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('programId', sql.Int, programId)
            .input('feeTypeId', sql.Int, feeTypeId)
            .input('amount', sql.Decimal(10, 2), amount)
            .input('effectiveFrom', sql.Date, effectiveFrom)
            .input('effectiveTo', sql.Date, effectiveTo)
            .query(`
                INSERT INTO fee_structure (program_id, fee_type_id, amount, effective_from, effective_to)
                OUTPUT INSERTED.fee_structure_id
                VALUES (@programId, @feeTypeId, @amount, @effectiveFrom, @effectiveTo)
            `);

        return res.status(201).json({ id: result.recordset[0].fee_structure_id });
    } catch (error) {
        console.error('Fee structure create error:', error);
        return res.status(500).json({ error: 'Failed to create fee structure record.' });
    }
});

router.put('/fee-structures/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const feeStructureId = parseIntField(req.params.id);
        const programId = parseIntField(req.body.program_id);
        const feeTypeId = parseIntField(req.body.fee_type_id);
        const amount = parseDecimalField(req.body.amount);
        const effectiveFrom = validateDate(req.body.effective_from);
        const effectiveTo = validateDate(req.body.effective_to);
        const errors = {};

        if (!feeStructureId || !(await recordExists(pool, 'fee_structure', 'fee_structure_id', feeStructureId))) {
            return res.status(404).json({ error: 'Fee structure record not found.' });
        }
        if (!programId) errors.program_id = 'Program is required.';
        if (!feeTypeId) errors.fee_type_id = 'Fee type is required.';
        if (amount === null || amount < 0) errors.amount = 'Valid amount is required.';
        if (!effectiveFrom) errors.effective_from = 'Effective from date is required.';
        if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
            errors.effective_to = 'Effective to date cannot be earlier than effective from date.';
        }
        if (programId && !(await recordExists(pool, 'programs', 'program_id', programId))) {
            errors.program_id = 'Selected program does not exist.';
        }
        if (feeTypeId && !(await recordExists(pool, 'fee_types', 'fee_type_id', feeTypeId))) {
            errors.fee_type_id = 'Selected fee type does not exist.';
        }

        const duplicate = programId && feeTypeId && effectiveFrom && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM fee_structure
            WHERE program_id = @programId
              AND fee_type_id = @feeTypeId
              AND effective_from = @effectiveFrom
              AND fee_structure_id <> @feeStructureId
        `, [
            { name: 'programId', type: sql.Int, value: programId },
            { name: 'feeTypeId', type: sql.Int, value: feeTypeId },
            { name: 'effectiveFrom', type: sql.Date, value: effectiveFrom },
            { name: 'feeStructureId', type: sql.Int, value: feeStructureId }
        ]);
        if (duplicate) errors.effective_from = 'A fee record for this program, fee type, and effective date already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('feeStructureId', sql.Int, feeStructureId)
            .input('programId', sql.Int, programId)
            .input('feeTypeId', sql.Int, feeTypeId)
            .input('amount', sql.Decimal(10, 2), amount)
            .input('effectiveFrom', sql.Date, effectiveFrom)
            .input('effectiveTo', sql.Date, effectiveTo)
            .query(`
                UPDATE fee_structure
                SET program_id = @programId,
                    fee_type_id = @feeTypeId,
                    amount = @amount,
                    effective_from = @effectiveFrom,
                    effective_to = @effectiveTo
                WHERE fee_structure_id = @feeStructureId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Fee structure update error:', error);
        return res.status(500).json({ error: 'Failed to update fee structure record.' });
    }
});

router.delete('/fee-structures/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const feeStructureId = parseIntField(req.params.id);
        if (!feeStructureId || !(await recordExists(pool, 'fee_structure', 'fee_structure_id', feeStructureId))) {
            return res.status(404).json({ error: 'Fee structure record not found.' });
        }

        await pool.request()
            .input('feeStructureId', sql.Int, feeStructureId)
            .query(`
                UPDATE fee_structure
                SET effective_to = ISNULL(effective_to, CAST(GETDATE() AS date))
                WHERE fee_structure_id = @feeStructureId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Fee structure deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate fee structure record.' });
    }
});

router.put('/fee-structures/:id/status', async (req, res) => {
    try {
        const pool = await getPool();
        const feeStructureId = parseIntField(req.params.id);
        const isActive = parseBit(req.body.isActive);

        if (!feeStructureId || !(await recordExists(pool, 'fee_structure', 'fee_structure_id', feeStructureId))) {
            return res.status(404).json({ error: 'Fee structure record not found.' });
        }

        // For fee structure, "Deactivate" means setting effective_to to today if it was NULL.
        // "Activate" means setting effective_to to NULL.
        if (isActive) {
            await pool.request()
                .input('id', sql.Int, feeStructureId)
                .query('UPDATE fee_structure SET effective_to = NULL WHERE fee_structure_id = @id');
        } else {
            await pool.request()
                .input('id', sql.Int, feeStructureId)
                .query('UPDATE fee_structure SET effective_to = CAST(GETDATE() AS date) WHERE fee_structure_id = @id AND effective_to IS NULL');
        }

        return res.json({ success: true, isActive });
    } catch (error) {
        console.error('Fee structure status update error:', error);
        return res.status(500).json({ error: 'Failed to update fee structure status.' });
    }
});

router.delete('/fee-structures/:id/permanent', async (req, res) => {
    try {
        const pool = await getPool();
        const feeStructureId = parseIntField(req.params.id);
        if (!feeStructureId || !(await recordExists(pool, 'fee_structure', 'fee_structure_id', feeStructureId))) {
            return res.status(404).json({ error: 'Fee structure record not found.' });
        }

        await pool.request()
            .input('id', sql.Int, feeStructureId)
            .query('DELETE FROM fee_structure WHERE fee_structure_id = @id');

        return res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Fee structure permanent delete error:', error);
        return res.status(500).json({ error: 'Failed to permanently delete fee structure.' });
    }
});

router.get('/scholarships', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT s.scholarship_id, s.scholarship_type_id, s.semester_id, s.application_deadline,
                   s.interview_date, s.announcement_date, s.max_beneficiaries, s.is_active,
                   st.type_name, st.funding_source, st.benefit_percentage, st.min_cgpa_required, st.is_renewable,
                   sem.semester_name, sem.semester_type, sem.year
            FROM scholarships s
            JOIN scholarship_types st ON s.scholarship_type_id = st.scholarship_type_id
            JOIN semesters sem ON s.semester_id = sem.semester_id
            ORDER BY s.application_deadline DESC, st.type_name
        `);
        return res.json(result.recordset);
    } catch (error) {
        console.error('Scholarship list error:', error);
        return res.status(500).json({ error: 'Failed to load scholarships.' });
    }
});

router.post('/scholarships', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipTypeId = parseIntField(req.body.scholarship_type_id);
        const semesterId = parseIntField(req.body.semester_id);
        const applicationDeadline = validateDate(req.body.application_deadline);
        const interviewDate = validateDate(req.body.interview_date);
        const announcementDate = validateDate(req.body.announcement_date);
        const maxBeneficiaries = req.body.max_beneficiaries === '' ? null : parseIntField(req.body.max_beneficiaries);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!scholarshipTypeId) errors.scholarship_type_id = 'Scholarship type is required.';
        if (!semesterId) errors.semester_id = 'Semester is required.';
        if (!applicationDeadline) errors.application_deadline = 'Application deadline is required.';
        if (maxBeneficiaries !== null && maxBeneficiaries <= 0) errors.max_beneficiaries = 'Max beneficiaries must be greater than 0.';
        if (scholarshipTypeId && !(await recordExists(pool, 'scholarship_types', 'scholarship_type_id', scholarshipTypeId))) {
            errors.scholarship_type_id = 'Selected scholarship type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (interviewDate && applicationDeadline && interviewDate < applicationDeadline) {
            errors.interview_date = 'Interview date cannot be earlier than application deadline.';
        }
        if (announcementDate && applicationDeadline && announcementDate < applicationDeadline) {
            errors.announcement_date = 'Announcement date cannot be earlier than application deadline.';
        }

        const duplicate = scholarshipTypeId && semesterId && applicationDeadline && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM scholarships
            WHERE scholarship_type_id = @scholarshipTypeId
              AND semester_id = @semesterId
              AND application_deadline = @applicationDeadline
        `, [
            { name: 'scholarshipTypeId', type: sql.Int, value: scholarshipTypeId },
            { name: 'semesterId', type: sql.Int, value: semesterId },
            { name: 'applicationDeadline', type: sql.Date, value: applicationDeadline }
        ]);
        if (duplicate) errors.application_deadline = 'A scholarship record for this type, semester, and deadline already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        const result = await pool.request()
            .input('scholarshipTypeId', sql.Int, scholarshipTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('applicationDeadline', sql.Date, applicationDeadline)
            .input('interviewDate', sql.Date, interviewDate)
            .input('announcementDate', sql.Date, announcementDate)
            .input('maxBeneficiaries', sql.Int, maxBeneficiaries)
            .input('isActive', sql.Bit, isActive)
            .query(`
                INSERT INTO scholarships (
                    scholarship_type_id, semester_id, application_deadline, interview_date,
                    announcement_date, max_beneficiaries, is_active
                )
                OUTPUT INSERTED.scholarship_id
                VALUES (
                    @scholarshipTypeId, @semesterId, @applicationDeadline, @interviewDate,
                    @announcementDate, @maxBeneficiaries, @isActive
                )
            `);

        return res.status(201).json({ id: result.recordset[0].scholarship_id });
    } catch (error) {
        console.error('Scholarship create error:', error);
        return res.status(500).json({ error: 'Failed to create scholarship.' });
    }
});

router.put('/scholarships/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipId = parseIntField(req.params.id);
        const scholarshipTypeId = parseIntField(req.body.scholarship_type_id);
        const semesterId = parseIntField(req.body.semester_id);
        const applicationDeadline = validateDate(req.body.application_deadline);
        const interviewDate = validateDate(req.body.interview_date);
        const announcementDate = validateDate(req.body.announcement_date);
        const maxBeneficiaries = req.body.max_beneficiaries === '' ? null : parseIntField(req.body.max_beneficiaries);
        const isActive = parseBit(req.body.is_active, true);
        const errors = {};

        if (!scholarshipId || !(await recordExists(pool, 'scholarships', 'scholarship_id', scholarshipId))) {
            return res.status(404).json({ error: 'Scholarship record not found.' });
        }
        if (!scholarshipTypeId) errors.scholarship_type_id = 'Scholarship type is required.';
        if (!semesterId) errors.semester_id = 'Semester is required.';
        if (!applicationDeadline) errors.application_deadline = 'Application deadline is required.';
        if (maxBeneficiaries !== null && maxBeneficiaries <= 0) errors.max_beneficiaries = 'Max beneficiaries must be greater than 0.';
        if (scholarshipTypeId && !(await recordExists(pool, 'scholarship_types', 'scholarship_type_id', scholarshipTypeId))) {
            errors.scholarship_type_id = 'Selected scholarship type does not exist.';
        }
        if (semesterId && !(await recordExists(pool, 'semesters', 'semester_id', semesterId))) {
            errors.semester_id = 'Selected semester does not exist.';
        }
        if (interviewDate && applicationDeadline && interviewDate < applicationDeadline) {
            errors.interview_date = 'Interview date cannot be earlier than application deadline.';
        }
        if (announcementDate && applicationDeadline && announcementDate < applicationDeadline) {
            errors.announcement_date = 'Announcement date cannot be earlier than application deadline.';
        }

        const duplicate = scholarshipTypeId && semesterId && applicationDeadline && await ensureNotDuplicate(pool, `
            SELECT TOP 1 1 AS found
            FROM scholarships
            WHERE scholarship_type_id = @scholarshipTypeId
              AND semester_id = @semesterId
              AND application_deadline = @applicationDeadline
              AND scholarship_id <> @scholarshipId
        `, [
            { name: 'scholarshipTypeId', type: sql.Int, value: scholarshipTypeId },
            { name: 'semesterId', type: sql.Int, value: semesterId },
            { name: 'applicationDeadline', type: sql.Date, value: applicationDeadline },
            { name: 'scholarshipId', type: sql.Int, value: scholarshipId }
        ]);
        if (duplicate) errors.application_deadline = 'A scholarship record for this type, semester, and deadline already exists.';

        if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

        await pool.request()
            .input('scholarshipId', sql.Int, scholarshipId)
            .input('scholarshipTypeId', sql.Int, scholarshipTypeId)
            .input('semesterId', sql.Int, semesterId)
            .input('applicationDeadline', sql.Date, applicationDeadline)
            .input('interviewDate', sql.Date, interviewDate)
            .input('announcementDate', sql.Date, announcementDate)
            .input('maxBeneficiaries', sql.Int, maxBeneficiaries)
            .input('isActive', sql.Bit, isActive)
            .query(`
                UPDATE scholarships
                SET scholarship_type_id = @scholarshipTypeId,
                    semester_id = @semesterId,
                    application_deadline = @applicationDeadline,
                    interview_date = @interviewDate,
                    announcement_date = @announcementDate,
                    max_beneficiaries = @maxBeneficiaries,
                    is_active = @isActive
                WHERE scholarship_id = @scholarshipId
            `);

        return res.json({ success: true });
    } catch (error) {
        console.error('Scholarship update error:', error);
        return res.status(500).json({ error: 'Failed to update scholarship.' });
    }
});

router.delete('/scholarships/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipId = parseIntField(req.params.id);
        if (!scholarshipId || !(await recordExists(pool, 'scholarships', 'scholarship_id', scholarshipId))) {
            return res.status(404).json({ error: 'Scholarship record not found.' });
        }

        await pool.request()
            .input('scholarshipId', sql.Int, scholarshipId)
            .query(`
                UPDATE scholarships
                SET is_active = 0
                WHERE scholarship_id = @scholarshipId
            `);

        return res.json({ success: true, softDeleted: true });
    } catch (error) {
        console.error('Scholarship deactivate error:', error);
        return res.status(500).json({ error: 'Failed to deactivate scholarship.' });
    }
});

router.put('/scholarships/:id/status', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipId = parseIntField(req.params.id);
        const isActive = parseBit(req.body.isActive);

        if (!scholarshipId || !(await recordExists(pool, 'scholarships', 'scholarship_id', scholarshipId))) {
            return res.status(404).json({ error: 'Scholarship not found.' });
        }

        await pool.request()
            .input('scholarshipId', sql.Int, scholarshipId)
            .input('isActive', sql.Bit, isActive)
            .query('UPDATE scholarships SET is_active = @isActive WHERE scholarship_id = @scholarshipId');

        return res.json({ success: true, isActive });
    } catch (error) {
        console.error('Scholarship status update error:', error);
        return res.status(500).json({ error: 'Failed to update scholarship status.' });
    }
});

router.delete('/scholarships/:id/permanent', async (req, res) => {
    try {
        const pool = await getPool();
        const scholarshipId = parseIntField(req.params.id);
        if (!scholarshipId || !(await recordExists(pool, 'scholarships', 'scholarship_id', scholarshipId))) {
            return res.status(404).json({ error: 'Scholarship not found.' });
        }

        await pool.request()
            .input('scholarshipId', sql.Int, scholarshipId)
            .query('DELETE FROM scholarships WHERE scholarship_id = @scholarshipId');

        return res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Scholarship permanent delete error:', error);
        return res.status(500).json({ error: 'Failed to permanently delete scholarship.' });
    }
});


router.get('/feedback', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT f.*, u.full_name as user_name, u.email as user_email
            FROM feedback f
            LEFT JOIN users u ON f.user_id = u.user_id
            ORDER BY f.created_at DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error('Feedback fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch feedback.' });
    }
});

router.delete('/feedback/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const feedbackId = parseIntField(req.params.id);
        
        await pool.request()
            .input('feedbackId', sql.Int, feedbackId)
            .query('DELETE FROM feedback WHERE feedback_id = @feedbackId');
            
        res.json({ success: true });
    } catch (error) {
        console.error('Feedback delete error:', error);
        res.status(500).json({ error: 'Failed to delete feedback.' });
    }
});

router.delete('/manual-payments/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const paymentId = parseIntField(req.params.id);
        
        // Use an atomic transaction for complete safety
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const request = new sql.Request(transaction);
            request.input('paymentId', sql.Int, paymentId);
            
            // Cleanup order: Notifications -> Subscriptions -> Payment
            await request.query('DELETE FROM dbo.notifications WHERE related_payment_id = @paymentId');
            await request.query('DELETE FROM dbo.user_subscriptions WHERE payment_id = @paymentId');
            const result = await request.query('DELETE FROM dbo.manual_payments WHERE payment_id = @paymentId');
            
            await transaction.commit();
            res.json({ success: true, affected: result.rowsAffected[0] });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error('CRITICAL: Payment delete failure:', error);
        res.status(500).json({ error: `Database error: ${error.message}` });
    }
});

router.delete('/subscriptions/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const subscriptionId = parseIntField(req.params.id);
        
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const request = new sql.Request(transaction);
            request.input('subscriptionId', sql.Int, subscriptionId);
            
            await request.query('DELETE FROM dbo.notifications WHERE related_subscription_id = @subscriptionId');
            const result = await request.query('DELETE FROM dbo.user_subscriptions WHERE subscription_id = @subscriptionId');
            
            await transaction.commit();
            res.json({ success: true, affected: result.rowsAffected[0] });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error('CRITICAL: Subscription delete failure:', error);
        res.status(500).json({ error: `Database error: ${error.message}` });
    }
});

module.exports = router;
