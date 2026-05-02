const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();
const {
    sendSubscriptionConfirmation,
    sendSubscriptionExpiry
} = require('../services/emailService');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');

const PAYMENT_PROOF_MAX_BYTES = 2 * 1024 * 1024;
const PAYMENT_PROOF_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'payment-proofs');

const PLAN_FALLBACKS = {
    weekly: {
        id: 'weekly',
        name: 'Weekly Premium',
        durationDays: 7,
        price: 199,
        currency: 'PKR',
        chatLimit: 200
    },
    monthly: {
        id: 'monthly',
        name: 'Monthly Premium',
        durationDays: 30,
        price: 499,
        currency: 'PKR',
        chatLimit: 1000
    }
};

function getPlan(plan = {}) {
    return PLAN_FALLBACKS[plan.id] || PLAN_FALLBACKS.monthly;
}

function buildSubscription(plan, paymentMethod) {
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    return {
        status: 'premium',
        planId: plan.id,
        planName: plan.name,
        price: plan.price,
        currency: plan.currency,
        chatLimit: plan.chatLimit,
        startedAt: startedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        paymentMethod,
        paymentStatus: 'paid',
        transactionId: `DEMO-${Date.now()}`
    };
}

function validateEmailRequest(email, res) {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        res.status(400).json({ error: 'Valid email is required.' });
        return null;
    }

    return normalizedEmail;
}

function normalizeText(value, maxLength = 500) {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, maxLength) : null;
}

function normalizePaymentMethod(value) {
    return String(value || '').trim().toLowerCase();
}

function getDataUrlImageExtension(mimeType) {
    const normalized = String(mimeType || '').toLowerCase();

    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/webp') return 'webp';

    return null;
}

async function savePaymentProofFile({ proofDataUrl, originalName, userId }) {
    const dataUrl = String(proofDataUrl || '').trim();

    if (!dataUrl) return { proofFilePath: null, proofOriginalName: normalizeText(originalName, 255) };

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);

    if (!match) {
        const error = new Error('Payment proof must be a valid image file.');
        error.status = 400;
        throw error;
    }

    const extension = getDataUrlImageExtension(match[1]);

    if (!extension) {
        const error = new Error('Payment proof must be PNG, JPG, or WEBP.');
        error.status = 400;
        throw error;
    }

    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.length > PAYMENT_PROOF_MAX_BYTES) {
        const error = new Error('Payment proof image must be 2 MB or smaller.');
        error.status = 400;
        throw error;
    }

    await fs.mkdir(PAYMENT_PROOF_UPLOAD_DIR, { recursive: true });

    const fileName = `payment-${userId}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
    const absolutePath = path.join(PAYMENT_PROOF_UPLOAD_DIR, fileName);
    await fs.writeFile(absolutePath, buffer);

    return {
        proofFilePath: `/uploads/payment-proofs/${fileName}`,
        proofOriginalName: normalizeText(originalName, 255) || fileName,
        absolutePath
    };
}

function buildPlanResponse(record = {}) {
    return {
        planId: record.plan_id,
        id: record.plan_code,
        code: record.plan_code,
        name: record.plan_name,
        description: record.description,
        price: Number(record.price),
        currency: record.currency,
        durationDays: record.duration_days,
        chatLimit: record.chat_limit,
        isActive: Boolean(record.is_active),
        sortOrder: record.sort_order
    };
}

function buildPaymentResponse(record = {}) {
    return {
        paymentId: record.payment_id,
        userId: record.user_id,
        planId: record.plan_id,
        planCode: record.plan_code,
        planName: record.plan_name,
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
        reviewedAt: record.reviewed_at,
        adminNote: record.admin_note,
        submittedAt: record.submitted_at,
        createdAt: record.created_at,
        updatedAt: record.updated_at
    };
}

function buildSubscriptionResponse(record = {}) {
    if (!record.subscription_id) {
        return {
            status: 'free',
            isPremium: false
        };
    }

    return {
        subscriptionId: record.subscription_id,
        userId: record.user_id,
        planId: record.plan_id,
        planCode: record.plan_code,
        planName: record.plan_name,
        paymentId: record.payment_id,
        status: record.status,
        isPremium: record.status === 'active' && new Date(record.expires_at).getTime() > Date.now(),
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

function buildNotificationResponse(record = {}) {
    return {
        notificationId: record.notification_id,
        type: record.notification_type,
        title: record.title,
        message: record.message,
        relatedPaymentId: record.related_payment_id,
        relatedSubscriptionId: record.related_subscription_id,
        isRead: Boolean(record.is_read),
        readAt: record.read_at,
        createdAt: record.created_at
    };
}

async function findActivePlan(pool, planIdentifier) {
    const value = String(planIdentifier || '').trim();
    const numericId = Number.parseInt(value, 10);
    const request = pool.request();

    if (numericId && String(numericId) === value) {
        request.input('planId', sql.Int, numericId);
        const result = await request.query(`
            SELECT TOP 1 *
            FROM dbo.subscription_plans
            WHERE plan_id = @planId
              AND is_active = 1
        `);
        return result.recordset[0] || null;
    }

    request.input('planCode', sql.NVarChar(50), value.toLowerCase());
    const result = await request.query(`
        SELECT TOP 1 *
        FROM dbo.subscription_plans
        WHERE plan_code = @planCode
          AND is_active = 1
    `);
    return result.recordset[0] || null;
}

router.use(requireAuth);

router.get('/plans', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                plan_id,
                plan_code,
                plan_name,
                description,
                price,
                currency,
                duration_days,
                chat_limit,
                is_active,
                sort_order
            FROM dbo.subscription_plans
            WHERE is_active = 1
            ORDER BY sort_order, plan_id
        `);

        return res.json({
            plans: result.recordset.map(buildPlanResponse)
        });
    } catch (error) {
        console.error('Subscription plans load error:', error);
        return res.status(500).json({ error: 'Failed to load subscription plans.' });
    }
});

router.get('/manual-payments', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .query(`
                SELECT
                    p.payment_id,
                    p.user_id,
                    p.plan_id,
                    sp.plan_code,
                    sp.plan_name,
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
                    p.reviewed_at,
                    p.admin_note,
                    p.submitted_at,
                    p.created_at,
                    p.updated_at
                FROM dbo.manual_payments p
                INNER JOIN dbo.subscription_plans sp ON p.plan_id = sp.plan_id
                WHERE p.user_id = @userId
                ORDER BY p.submitted_at DESC, p.payment_id DESC
            `);

        return res.json({
            payments: result.recordset.map(buildPaymentResponse)
        });
    } catch (error) {
        console.error('Manual payment list error:', error);
        return res.status(500).json({ error: 'Failed to load manual payments.' });
    }
});

router.post('/manual-payments', async (req, res) => {
    const userId = Number(req.auth.sub);
    const planIdentifier = req.body.planCode || req.body.planId || req.body.plan_id;
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod || req.body.payment_method);
    const allowedMethods = new Set(['easypaisa', 'jazzcash', 'bank_transfer', 'cash', 'other']);
    const senderAccountName = normalizeText(req.body.senderAccountName || req.body.sender_account_name, 150);
    const senderAccountNumber = normalizeText(req.body.senderAccountNumber || req.body.sender_account_number, 50);
    const transactionReference = normalizeText(req.body.transactionReference || req.body.transaction_reference, 100);
    const studentNote = normalizeText(req.body.studentNote || req.body.student_note, 500);
    const errors = {};

    if (!planIdentifier) {
        errors.plan = 'A subscription plan is required.';
    }

    if (!allowedMethods.has(paymentMethod)) {
        errors.paymentMethod = 'Payment method must be easypaisa, jazzcash, bank_transfer, cash, or other.';
    }

    if (paymentMethod !== 'cash') {
        if (!senderAccountName) {
            errors.senderAccountName = 'Sender account name is required.';
        }

        if (!senderAccountNumber) {
            errors.senderAccountNumber = 'Sender account number is required.';
        }

        if (!transactionReference) {
            errors.transactionReference = 'Transaction reference is required.';
        }
    }

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: 'Validation failed.', details: errors });
    }

    let transaction;
    let savedProof = null;

    try {
        const pool = await getPool();
        const plan = await findActivePlan(pool, planIdentifier);

        if (!plan) {
            return res.status(404).json({ error: 'Selected subscription plan was not found or is inactive.' });
        }

        // 1. Check for existing pending requests
        const pendingCheck = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT TOP 1 p.payment_id, sp.plan_name
                FROM dbo.manual_payments p
                INNER JOIN dbo.subscription_plans sp ON p.plan_id = sp.plan_id
                WHERE p.user_id = @userId AND p.status = 'pending'
            `);

        if (pendingCheck.recordset.length > 0) {
            const p = pendingCheck.recordset[0];
            return res.status(400).json({ 
                error: `You already have a pending request for ${p.plan_name} awaiting approval.`,
                code: 'PENDING_REQUEST_EXISTS',
                planName: p.plan_name
            });
        }

        // 2. Check for active subscriptions
        const activeCheck = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT TOP 1 s.subscription_id, sp.plan_name, s.expires_at
                FROM dbo.user_subscriptions s
                INNER JOIN dbo.subscription_plans sp ON s.plan_id = sp.plan_id
                WHERE s.user_id = @userId AND s.status = 'active' AND s.expires_at > GETDATE()
            `);

        if (activeCheck.recordset.length > 0) {
            const s = activeCheck.recordset[0];
            const expiryDate = new Date(s.expires_at).toLocaleDateString();
            return res.status(400).json({ 
                error: `You are already subscribed to the ${s.plan_name} which expires on ${expiryDate}.`,
                code: 'ACTIVE_SUBSCRIPTION_EXISTS',
                planName: s.plan_name,
                expiresAt: s.expires_at
            });
        }

        savedProof = await savePaymentProofFile({
            proofDataUrl: req.body.proofDataUrl || req.body.proof_data_url,
            originalName: req.body.proofOriginalName || req.body.proof_original_name,
            userId
        });

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const paymentResult = await new sql.Request(transaction)
            .input('userId', sql.Int, userId)
            .input('planId', sql.Int, plan.plan_id)
            .input('amount', sql.Decimal(10, 2), Number(plan.price))
            .input('currency', sql.NVarChar(10), plan.currency)
            .input('paymentMethod', sql.NVarChar(30), paymentMethod)
            .input('senderAccountName', sql.NVarChar(150), senderAccountName)
            .input('senderAccountNumber', sql.NVarChar(50), senderAccountNumber)
            .input('transactionReference', sql.NVarChar(100), transactionReference)
            .input('proofFilePath', sql.NVarChar(500), savedProof.proofFilePath)
            .input('proofOriginalName', sql.NVarChar(255), savedProof.proofOriginalName)
            .input('studentNote', sql.NVarChar(500), studentNote)
            .query(`
                INSERT INTO dbo.manual_payments (
                    user_id,
                    plan_id,
                    amount,
                    currency,
                    payment_method,
                    sender_account_name,
                    sender_account_number,
                    transaction_reference,
                    proof_file_path,
                    proof_original_name,
                    student_note,
                    status
                )
                OUTPUT
                    inserted.payment_id,
                    inserted.user_id,
                    inserted.plan_id,
                    inserted.amount,
                    inserted.currency,
                    inserted.payment_method,
                    inserted.sender_account_name,
                    inserted.sender_account_number,
                    inserted.transaction_reference,
                    inserted.proof_file_path,
                    inserted.proof_original_name,
                    inserted.student_note,
                    inserted.status,
                    inserted.reviewed_by,
                    inserted.reviewed_at,
                    inserted.admin_note,
                    inserted.submitted_at,
                    inserted.created_at,
                    inserted.updated_at
                VALUES (
                    @userId,
                    @planId,
                    @amount,
                    @currency,
                    @paymentMethod,
                    @senderAccountName,
                    @senderAccountNumber,
                    @transactionReference,
                    @proofFilePath,
                    @proofOriginalName,
                    @studentNote,
                    'pending'
                )
            `);

        const payment = paymentResult.recordset[0];

        await new sql.Request(transaction)
            .input('userId', sql.Int, userId)
            .input('paymentId', sql.Int, payment.payment_id)
            .input('title', sql.NVarChar(150), 'Payment request submitted')
            .input('message', sql.NVarChar(1000), `Your ${plan.plan_name} payment request is pending admin review.`)
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
                    'payment_submitted',
                    @title,
                    @message,
                    @paymentId
                )
            `);

        await transaction.commit();
        transaction = null;

        return res.status(201).json({
            message: 'Manual payment request submitted successfully.',
            payment: buildPaymentResponse({
                ...payment,
                plan_code: plan.plan_code,
                plan_name: plan.plan_name
            }),
            plan: buildPlanResponse(plan)
        });
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Manual payment rollback error:', rollbackError);
            }
        }

        if (savedProof?.absolutePath) {
            try {
                await fs.unlink(savedProof.absolutePath);
            } catch (unlinkError) {
                console.error('Manual payment proof cleanup error:', unlinkError);
            }
        }

        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }

        if (error.number === 2601 || error.number === 2627) {
            return res.status(409).json({ error: 'This transaction reference has already been submitted.' });
        }

        console.error('Manual payment submit error:', error);
        return res.status(500).json({ error: 'Failed to submit manual payment request.' });
    }
});

router.get('/current', async (req, res) => {
    try {
        const pool = await getPool();

        await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .query(`
                UPDATE dbo.user_subscriptions
                SET status = 'expired'
                WHERE user_id = @userId
                  AND status = 'active'
                  AND expires_at <= GETDATE()
            `);

        const result = await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .query(`
                SELECT TOP 1
                    s.subscription_id,
                    s.user_id,
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
                INNER JOIN dbo.subscription_plans sp ON s.plan_id = sp.plan_id
                WHERE s.user_id = @userId
                  AND s.status = 'active'
                  AND s.expires_at > GETDATE()
                ORDER BY s.expires_at DESC, s.subscription_id DESC
            `);

        return res.json({
            subscription: buildSubscriptionResponse(result.recordset[0] || {})
        });
    } catch (error) {
        console.error('Current subscription load error:', error);
        return res.status(500).json({ error: 'Failed to load current subscription.' });
    }
});

router.get('/notifications', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .query(`
                SELECT TOP 30
                    notification_id,
                    notification_type,
                    title,
                    message,
                    related_payment_id,
                    related_subscription_id,
                    is_read,
                    read_at,
                    created_at
                FROM dbo.notifications
                WHERE user_id = @userId
                ORDER BY created_at DESC, notification_id DESC
            `);

        return res.json({
            notifications: result.recordset.map(buildNotificationResponse)
        });
    } catch (error) {
        console.error('Notifications list error:', error);
        return res.status(500).json({ error: 'Failed to load notifications.' });
    }
});

router.patch('/notifications/:id/read', async (req, res) => {
    const notificationId = Number.parseInt(req.params.id, 10);

    if (!notificationId) {
        return res.status(400).json({ error: 'A valid notification id is required.' });
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .input('notificationId', sql.Int, notificationId)
            .query(`
                UPDATE dbo.notifications
                SET is_read = 1,
                    read_at = COALESCE(read_at, GETDATE())
                OUTPUT
                    inserted.notification_id,
                    inserted.notification_type,
                    inserted.title,
                    inserted.message,
                    inserted.related_payment_id,
                    inserted.related_subscription_id,
                    inserted.is_read,
                    inserted.read_at,
                    inserted.created_at
                WHERE notification_id = @notificationId
                  AND user_id = @userId
            `);

        const notification = result.recordset[0];

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found.' });
        }

        return res.json({
            message: 'Notification marked as read.',
            notification: buildNotificationResponse(notification)
        });
    } catch (error) {
        console.error('Notification read update error:', error);
        return res.status(500).json({ error: 'Failed to update notification.' });
    }
});

router.patch('/notifications/read-all', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .query(`
                UPDATE dbo.notifications
                SET is_read = 1,
                    read_at = COALESCE(read_at, GETDATE())
                WHERE user_id = @userId
                  AND is_read = 0
            `);

        return res.json({
            message: 'Notifications marked as read.',
            updatedCount: result.rowsAffected?.[0] || 0
        });
    } catch (error) {
        console.error('Notifications read-all update error:', error);
        return res.status(500).json({ error: 'Failed to update notifications.' });
    }
});

router.delete('/notifications/:id', async (req, res) => {
    const notificationId = Number.parseInt(req.params.id, 10);

    if (!notificationId) {
        return res.status(400).json({ error: 'A valid notification id is required.' });
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .input('notificationId', sql.Int, notificationId)
            .query(`
                DELETE FROM dbo.notifications
                WHERE notification_id = @notificationId
                  AND user_id = @userId
            `);

        if ((result.rowsAffected?.[0] || 0) === 0) {
            return res.status(404).json({ error: 'Notification not found.' });
        }

        return res.json({ message: 'Notification deleted.' });
    } catch (error) {
        console.error('Notification delete error:', error);
        return res.status(500).json({ error: 'Failed to delete notification.' });
    }
});

router.delete('/notifications', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, Number(req.auth.sub))
            .query(`
                DELETE FROM dbo.notifications
                WHERE user_id = @userId
            `);

        return res.json({
            message: 'Notifications cleared.',
            deletedCount: result.rowsAffected?.[0] || 0
        });
    } catch (error) {
        console.error('Notifications clear error:', error);
        return res.status(500).json({ error: 'Failed to clear notifications.' });
    }
});

router.post('/demo-payment', async (req, res) => {
    const email = validateEmailRequest(req.auth?.email, res);
    if (!email) return;

    const name = String(req.body.name || req.auth?.name || '').trim() || 'Student';
    const { paymentMethod = 'Demo Payment' } = req.body;
    const plan = getPlan(req.body.plan);
    const subscription = buildSubscription(plan, paymentMethod);
    const payment = {
        status: 'paid',
        transactionId: subscription.transactionId,
        method: paymentMethod,
        amount: plan.price,
        currency: plan.currency,
        paidAt: subscription.startedAt
    };

    try {
        const emailResult = await sendSubscriptionConfirmation({
            name,
            email,
            plan,
            subscription,
            paymentMethod
        });

        res.json({
            success: true,
            payment,
            subscription,
            email: emailResult
        });
    } catch (error) {
        console.error('Subscription confirmation email failed:', error);
        res.status(500).json({
            success: false,
            payment,
            subscription,
            email: {
                sent: false,
                error: 'Email could not be sent.'
            }
        });
    }
});

router.post('/expiry-email', async (req, res) => {
    const email = validateEmailRequest(req.auth?.email, res);
    if (!email) return;

    const name = String(req.body.name || req.auth?.name || '').trim() || 'Student';
    const { subscription, status = 'expiring' } = req.body;

    if (!subscription?.expiresAt) {
        return res.status(400).json({ error: 'Subscription expiry date is required.' });
    }

    try {
        const emailResult = await sendSubscriptionExpiry({
            name,
            email,
            subscription,
            status
        });

        res.json({
            success: true,
            email: emailResult
        });
    } catch (error) {
        console.error('Subscription expiry email failed:', error);
        res.status(500).json({
            success: false,
            email: {
                sent: false,
                error: 'Email could not be sent.'
            }
        });
    }
});

module.exports = router;
