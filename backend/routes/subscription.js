const express = require('express');
const router = express.Router();
const {
    sendSubscriptionConfirmation,
    sendSubscriptionExpiry
} = require('../services/emailService');

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

function validateEmailRequest(req, res) {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Valid email is required.' });
        return false;
    }

    return true;
}

router.post('/demo-payment', async (req, res) => {
    if (!validateEmailRequest(req, res)) return;

    const { name, email, paymentMethod = 'Demo Payment' } = req.body;
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
    if (!validateEmailRequest(req, res)) return;

    const { name, email, subscription, status = 'expiring' } = req.body;

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
