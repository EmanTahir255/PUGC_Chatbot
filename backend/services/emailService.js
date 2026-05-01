const nodemailer = require('nodemailer');

function hasSmtpConfig() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function createTransporter() {
    const port = Number(process.env.SMTP_PORT || 587);
    const config = {
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465
    };

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        config.auth = {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        };
    }

    return nodemailer.createTransport(config);
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleDateString('en-PK', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

async function sendMail({ to, subject, html, text }) {
    if (!hasSmtpConfig()) {
        return {
            sent: false,
            skipped: true,
            reason: 'SMTP settings are not configured.'
        };
    }

    const transporter = createTransporter();
    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        html,
        text
    });

    return {
        sent: true,
        messageId: info.messageId
    };
}

function buildConfirmationEmail({ name, plan, subscription, paymentMethod }) {
    const displayName = name || 'Student';
    const amount = `${plan.currency || 'PKR'} ${plan.price}`;

    return {
        subject: 'PUGC SmartBot Premium Subscription Activated',
        text: `Hello ${displayName}, your ${plan.name} subscription is active until ${formatDate(subscription.expiresAt)}. Payment method: ${paymentMethod}. Amount: ${amount}.`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447">
                <h2 style="color:#002147">Subscription Activated</h2>
                <p>Hello ${displayName},</p>
                <p>Your <strong>${plan.name}</strong> subscription is now active.</p>
                <ul>
                    <li><strong>Amount:</strong> ${amount}</li>
                    <li><strong>Payment method:</strong> ${paymentMethod}</li>
                    <li><strong>Expiry date:</strong> ${formatDate(subscription.expiresAt)}</li>
                </ul>
                <p>You can now use premium chatbot features in PUGC SmartBot.</p>
            </div>
        `
    };
}

function buildExpiryEmail({ name, subscription, status }) {
    const displayName = name || 'Student';
    const expired = status === 'expired';
    const subject = expired
        ? 'PUGC SmartBot Premium Subscription Expired'
        : 'PUGC SmartBot Premium Subscription Ending Soon';
    const lead = expired
        ? 'Your premium subscription has expired.'
        : 'Your premium subscription is ending soon.';

    return {
        subject,
        text: `Hello ${displayName}, ${lead} Expiry date: ${formatDate(subscription.expiresAt)}.`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447">
                <h2 style="color:#002147">${expired ? 'Subscription Expired' : 'Subscription Ending Soon'}</h2>
                <p>Hello ${displayName},</p>
                <p>${lead}</p>
                <ul>
                    <li><strong>Plan:</strong> ${subscription.planName || 'Premium'}</li>
                    <li><strong>Expiry date:</strong> ${formatDate(subscription.expiresAt)}</li>
                </ul>
                <p>Open PUGC SmartBot and renew your plan to keep premium access.</p>
            </div>
        `
    };
}

async function sendSubscriptionConfirmation(payload) {
    const email = buildConfirmationEmail(payload);
    return sendMail({
        to: payload.email,
        ...email
    });
}

async function sendSubscriptionExpiry(payload) {
    const email = buildExpiryEmail(payload);
    return sendMail({
        to: payload.email,
        ...email
    });
}

module.exports = {
    sendSubscriptionConfirmation,
    sendSubscriptionExpiry
};
