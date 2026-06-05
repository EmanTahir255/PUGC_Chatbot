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
    console.log(`[EmailService] Attempting to send email to: ${to} | Subject: ${subject}`);
    
    if (!hasSmtpConfig()) {
        console.warn('[EmailService] SKIPPED: SMTP settings (HOST or FROM) are missing in .env');
        return {
            sent: false,
            skipped: true,
            reason: 'SMTP settings are not configured.'
        };
    }

    try {
        const transporter = createTransporter();
        const mailOptions = {
            from: process.env.SMTP_FROM,
            to,
            subject,
            html,
            text
        };

        if (process.env.ADMIN_NOTIFICATION_EMAILS) {
            mailOptions.bcc = process.env.ADMIN_NOTIFICATION_EMAILS;
            console.log(`[EmailService] Adding BCC to: ${mailOptions.bcc}`);
        }

        const info = await transporter.sendMail(mailOptions);
        console.log('[EmailService] SUCCESS: Email sent! Message ID:', info.messageId);

        return {
            sent: true,
            messageId: info.messageId
        };
    } catch (error) {
        console.error('[EmailService] FAILED: Error sending email:', error.message);
        throw error;
    }
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

function buildCancellationEmail({ name, subscription, reason }) {
    const displayName = name || 'Student';
    const cancellationReason = reason || 'No specific reason provided by administrator.';

    return {
        subject: 'PUGC SmartBot Premium Subscription Cancelled',
        text: `Hello ${displayName}, your ${subscription.planName || 'Premium'} subscription has been cancelled. Reason: ${cancellationReason}`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447">
                <h2 style="color:#b04444">Subscription Cancelled</h2>
                <p>Hello ${displayName},</p>
                <p>Your <strong>${subscription.planName || 'Premium'}</strong> subscription has been cancelled by the administrator.</p>
                <div style="background:#f8f9fa;padding:15px;border-left:4px solid #b04444;margin:20px 0;">
                    <strong>Reason for cancellation:</strong><br>
                    ${cancellationReason}
                </div>
                <p>If you believe this is an error, please contact the administration department.</p>
            </div>
        `
    };
}

function buildRejectionEmail({ name, planName, reason }) {
    const displayName = name || 'Student';
    const rejectionReason = reason || 'Payment proof was unclear or transaction could not be verified.';

    return {
        subject: 'PUGC SmartBot Premium Subscription Request Rejected',
        text: `Hello ${displayName}, your request for the ${planName} subscription was rejected. Reason: ${rejectionReason}`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447">
                <h2 style="color:#b04444">Payment Request Rejected</h2>
                <p>Hello ${displayName},</p>
                <p>Your request for the <strong>${planName}</strong> subscription has been rejected.</p>
                <div style="background:#f8f9fa;padding:15px;border-left:4px solid #b04444;margin:20px 0;">
                    <strong>Reason for rejection:</strong><br>
                    ${rejectionReason}
                </div>
                <p>Please double-check your payment details and upload a clear proof of payment to try again.</p>
            </div>
        `
    };
}

function buildAccountStatusEmail({ name, status }) {
    const displayName = name || 'User';
    let title, message, color;

    switch (status) {
        case 'active':
            title = 'Account Activated';
            message = 'Your account has been activated. You can now log in and use all features.';
            color = '#28a745';
            break;
        case 'inactive':
            title = 'Account Deactivated';
            message = 'Your account has been deactivated by the administrator. You will not be able to log in until it is reactivated.';
            color = '#dc3545';
            break;
        case 'deleted':
            title = 'Account Deleted';
            message = 'Your account and all associated data have been permanently deleted from our system.';
            color = '#6c757d';
            break;
        default:
            title = 'Account Status Updated';
            message = `Your account status has been updated to: ${status}.`;
            color = '#002147';
    }

    return {
        subject: `PUGC SmartBot: ${title}`,
        text: `Hello ${displayName}, ${message}`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447">
                <h2 style="color:${color}">${title}</h2>
                <p>Hello ${displayName},</p>
                <p>${message}</p>
                ${status === 'active' ? '<p><a href="https://pugc-chatbot.com/login" style="background:#002147;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Login Now</a></p>' : ''}
            </div>
        `
    };
}

function buildRoleChangeEmail({ name, newRole }) {
    const displayName = name || 'User';
    const roleName = newRole.charAt(0).toUpperCase() + newRole.slice(1);

    return {
        subject: 'PUGC SmartBot: User Role Updated',
        text: `Hello ${displayName}, your user role has been updated to ${roleName}.`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447">
                <h2 style="color:#002147">Role Updated</h2>
                <p>Hello ${displayName},</p>
                <p>Your user role on PUGC SmartBot has been updated to: <strong>${roleName}</strong>.</p>
                <p>Please log out and sign back in to see the changes in your dashboard.</p>
            </div>
        `
    };
}

function buildResetPasswordEmail({ name, resetLink }) {
    const displayName = name || 'Student';
    return {
        subject: 'Reset Your PUGC SmartBot Password',
        text: `Hello ${displayName}, you requested to reset your password. Click the link below to set a new password. The link expires in 1 hour. Link: ${resetLink}`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447;max-width:600px;margin:auto;border:1px solid #e1e8ed;padding:20px;border-radius:10px;">
                <div style="text-align:center;margin-bottom:20px;">
                    <h2 style="color:#002147;margin:0;">PUGC SmartBot</h2>
                </div>
                <h3 style="color:#243447;">Reset Your Password</h3>
                <p>Hello ${displayName},</p>
                <p>We received a request to reset your password for your PUGC SmartBot account. Click the button below to choose a new password:</p>
                <div style="text-align:center;margin:30px 0;">
                    <a href="${resetLink}" style="background-color:#002147;color:white;padding:14px 28px;text-decoration:none;border-radius:50px;font-weight:bold;display:inline-block;">Reset Password</a>
                </div>
                <p style="font-size:0.9rem;color:#657786;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="font-size:0.85rem;word-break:break-all;"><a href="${resetLink}" style="color:#1da1f2;">${resetLink}</a></p>
                <hr style="border:none;border-top:1px solid #e1e8ed;margin:25px 0;">
                <p style="font-size:0.85rem;color:#657786;">This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
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

async function sendSubscriptionCancellation(payload) {
    const email = buildCancellationEmail(payload);
    return sendMail({
        to: payload.email,
        ...email
    });
}

async function sendSubscriptionRejection(payload) {
    const email = buildRejectionEmail(payload);
    return sendMail({
        to: payload.email,
        ...email
    });
}

async function sendUserAccountStatusEmail(payload) {
    const email = buildAccountStatusEmail(payload);
    return sendMail({
        to: payload.email,
        ...email
    });
}

async function sendUserRoleChangeEmail(payload) {
    const email = buildRoleChangeEmail(payload);
    return sendMail({
        to: payload.email,
        ...email
    });
}

async function sendPasswordResetEmail(payload) {
    const email = buildResetPasswordEmail(payload);
    return sendMail({
        to: payload.email,
        ...email
    });
}

module.exports = {
    sendSubscriptionConfirmation,
    sendSubscriptionExpiry,
    sendSubscriptionCancellation,
    sendSubscriptionRejection,
    sendUserAccountStatusEmail,
    sendUserRoleChangeEmail,
    sendPasswordResetEmail
};
