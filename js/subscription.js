const SubscriptionService = (() => {
    const FREE_CHAT_LIMIT = 20;
    const EXPIRY_REMINDER_DAYS = 3;
    const API_BASE_URL = 'http://localhost:3000/api';

    const PLANS = {
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

    function readJSON(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function todayKey() {
        return new Date().toISOString().slice(0, 10);
    }

    function formatDate(value) {
        if (!value) return 'Not active';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Not active';
        return date.toLocaleDateString('en-PK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    function getCurrentUser() {
        const currentUser = readJSON('currentUser', null);
        const email = currentUser?.email || localStorage.getItem('userEmail') || '';
        const role = currentUser?.role || localStorage.getItem('userRole') || 'student';
        const fallbackName = email ? email.split('@')[0] : 'Student';

        return {
            ...(currentUser || {}),
            email,
            role,
            name: currentUser?.name || fallbackName,
            subscription: currentUser?.subscription || { status: 'free' },
            features: currentUser?.features || []
        };
    }

    function saveCurrentUser(user) {
        if (!user?.email) return;

        writeJSON('currentUser', user);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userRole', user.role || 'student');

        const users = readJSON('users', []);
        const index = users.findIndex(item => item.email === user.email);

        if (index >= 0) {
            users[index] = {
                ...users[index],
                ...user
            };
        } else {
            users.push(user);
        }

        writeJSON('users', users);
    }

    function isSubscriptionExpired(subscription) {
        if (!subscription || subscription.status !== 'premium' || !subscription.expiresAt) {
            return false;
        }

        return new Date(subscription.expiresAt).getTime() <= Date.now();
    }

    function getDaysUntilExpiry(subscription) {
        if (!subscription?.expiresAt) return null;
        const difference = new Date(subscription.expiresAt).getTime() - Date.now();
        return Math.ceil(difference / (1000 * 60 * 60 * 24));
    }

    function isPremium() {
        const user = getCurrentUser();
        return user.subscription?.status === 'premium' && !isSubscriptionExpired(user.subscription);
    }

    function getUsageKey(email) {
        return `chatUsage_${email}_${todayKey()}`;
    }

    function getTodayUsage() {
        const user = getCurrentUser();
        if (!user.email) return 0;
        return Number(localStorage.getItem(getUsageKey(user.email)) || 0);
    }

    function getChatLimit() {
        const user = getCurrentUser();
        if (isPremium()) {
            return user.subscription?.chatLimit || PLANS.monthly.chatLimit;
        }

        return FREE_CHAT_LIMIT;
    }

    function getRemainingMessages() {
        if (isPremium()) return Infinity;
        return Math.max(FREE_CHAT_LIMIT - getTodayUsage(), 0);
    }

    function canSendChatMessage() {
        if (isPremium()) {
            return { allowed: true, remaining: Infinity, limit: getChatLimit() };
        }

        const used = getTodayUsage();
        const remaining = Math.max(FREE_CHAT_LIMIT - used, 0);

        return {
            allowed: used < FREE_CHAT_LIMIT,
            used,
            remaining,
            limit: FREE_CHAT_LIMIT
        };
    }

    function recordChatMessage() {
        if (isPremium()) return;

        const user = getCurrentUser();
        if (!user.email) return;

        const usageKey = getUsageKey(user.email);
        const count = Number(localStorage.getItem(usageKey) || 0);
        localStorage.setItem(usageKey, String(count + 1));
        updateUsageBadges();
    }

    function activateSubscription(planId, paymentMethod, paymentRecord = {}) {
        const plan = PLANS[planId] || PLANS.monthly;
        const user = getCurrentUser();
        const startedAt = new Date();
        const expiresAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

        const subscription = {
            status: 'premium',
            planId: plan.id,
            planName: plan.name,
            price: plan.price,
            currency: plan.currency,
            chatLimit: plan.chatLimit,
            startedAt: startedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            paymentMethod,
            paymentStatus: paymentRecord.status || 'paid',
            transactionId: paymentRecord.transactionId || `DEMO-${Date.now()}`
        };

        const updatedUser = {
            ...user,
            subscription,
            features: [
                'Full Chat History',
                'Event Reminders',
                'Fee Challan Generator',
                'Smart Transcript Request Form Generator',
                'Higher Chat Limit'
            ]
        };

        saveCurrentUser(updatedUser);
        updateUsageBadges();
        updateNotificationCenter();

        return subscription;
    }

    function downgradeToFree(reason = 'expired') {
        const user = getCurrentUser();
        if (!user.email) return null;

        const updatedUser = {
            ...user,
            subscription: {
                status: 'free',
                previousStatus: user.subscription?.status,
                endedAt: new Date().toISOString(),
                reason
            },
            features: []
        };

        saveCurrentUser(updatedUser);
        updateUsageBadges();
        return updatedUser.subscription;
    }

    function getNotificationKey() {
        const user = getCurrentUser();
        return `siteNotifications_${user.email || 'guest'}`;
    }

    function getNotifications() {
        return readJSON(getNotificationKey(), []);
    }

    function saveNotifications(notifications) {
        writeJSON(getNotificationKey(), notifications);
    }

    function markNotificationsRead() {
        const notifications = getNotifications().map(notification => ({
            ...notification,
            read: true
        }));

        saveNotifications(notifications);
        updateNotificationCenter();
    }

    function addNotification(type, title, message, actionHref = '') {
        const notification = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type,
            title,
            message,
            actionHref,
            read: false,
            createdAt: new Date().toISOString()
        };

        const notifications = getNotifications();
        notifications.unshift(notification);
        saveNotifications(notifications.slice(0, 20));
        updateNotificationCenter();
        showToast(notification);

        return notification;
    }

    function deleteNotification(notificationId) {
        const notifications = getNotifications().filter(notification => notification.id !== notificationId);
        saveNotifications(notifications);
        updateNotificationCenter();
    }

    function clearNotifications() {
        saveNotifications([]);
        updateNotificationCenter();
    }

    function showToast(notification) {
        let toastHost = document.querySelector('.site-toast-host');

        if (!toastHost) {
            toastHost = document.createElement('div');
            toastHost.className = 'site-toast-host';
            document.body.appendChild(toastHost);
        }

        const toast = document.createElement('div');
        toast.className = `site-toast ${notification.type || 'info'}`;
        toast.innerHTML = `
            <strong>${notification.title}</strong>
            <span>${notification.message}</span>
        `;

        toastHost.appendChild(toast);
        window.setTimeout(() => toast.classList.add('visible'), 20);
        window.setTimeout(() => {
            toast.classList.remove('visible');
            window.setTimeout(() => toast.remove(), 250);
        }, 4200);
    }

    function ensureNotificationCenter() {
        if (document.getElementById('site-notification-center')) return;
        if (!document.body.classList.contains('protected-page') && !document.querySelector('.dashboard-layout')) return;

        const center = document.createElement('div');
        center.id = 'site-notification-center';
        center.className = 'site-notification-center';
        center.innerHTML = `
            <button type="button" class="notification-toggle" aria-label="Open notifications" aria-expanded="false">
                <i class="fas fa-bell"></i>
                <span class="notification-count" hidden>0</span>
            </button>
            <div class="notification-panel" aria-hidden="true">
                <div class="notification-panel-header">
                    <strong>Notifications</strong>
                    <button type="button" class="notification-clear">Clear all</button>
                </div>
                <div class="notification-list"></div>
            </div>
        `;

        document.body.appendChild(center);

        const toggle = center.querySelector('.notification-toggle');
        const panel = center.querySelector('.notification-panel');

        toggle.addEventListener('click', event => {
            event.stopPropagation();
            const isOpen = center.classList.toggle('open');
            toggle.setAttribute('aria-expanded', String(isOpen));
            panel.setAttribute('aria-hidden', String(!isOpen));

            if (isOpen) {
                markNotificationsRead();
            }
        });

        center.querySelector('.notification-clear').addEventListener('click', clearNotifications);

        document.addEventListener('click', event => {
            if (center.contains(event.target)) return;
            center.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
            panel.setAttribute('aria-hidden', 'true');
        });
    }

    function updateNotificationCenter() {
        const center = document.getElementById('site-notification-center');
        if (!center) return;

        const notifications = getNotifications();
        const unreadCount = notifications.filter(notification => !notification.read).length;
        const count = center.querySelector('.notification-count');
        const list = center.querySelector('.notification-list');

        count.textContent = unreadCount;
        count.hidden = unreadCount === 0;

        if (notifications.length === 0) {
            list.innerHTML = '<p class="notification-empty">No notifications yet.</p>';
            return;
        }

        list.innerHTML = notifications.map(notification => `
            <div class="notification-item ${notification.read ? '' : 'unread'}">
                <a class="notification-content" href="${notification.actionHref || '#'}">
                    <strong>${notification.title}</strong>
                    <span>${notification.message}</span>
                    <small>${formatDate(notification.createdAt)}</small>
                </a>
                <button type="button" class="notification-delete" data-notification-id="${notification.id}" aria-label="Delete notification">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        list.querySelectorAll('.notification-delete').forEach(button => {
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                deleteNotification(button.dataset.notificationId);
            });
        });
    }

    async function sendEmail(endpoint, payload) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Email API request failed');
        }

        return response.json();
    }

    async function runDemoPayment(planId, paymentMethod) {
        const user = getCurrentUser();
        const plan = PLANS[planId] || PLANS.monthly;

        try {
            const result = await sendEmail('/subscription/demo-payment', {
                name: user.name,
                email: user.email,
                plan,
                paymentMethod
            });

            return result;
        } catch (error) {
            return {
                success: false,
                email: { sent: false, error: error.message },
                payment: {
                    status: 'paid',
                    transactionId: `LOCAL-DEMO-${Date.now()}`
                }
            };
        }
    }

    async function sendExpiryEmail(subscription, status = 'expiring') {
        const user = getCurrentUser();
        if (!user.email) return null;

        try {
            return await sendEmail('/subscription/expiry-email', {
                name: user.name,
                email: user.email,
                subscription,
                status
            });
        } catch (error) {
            return { success: false, email: { sent: false, error: error.message } };
        }
    }

    async function checkSubscriptionLifecycle() {
        const user = getCurrentUser();
        const subscription = user.subscription;

        if (!user.email || subscription?.status !== 'premium') return;

        if (isSubscriptionExpired(subscription)) {
            const noticeKey = `expiryNoticeSent_${user.email}_${subscription.transactionId || subscription.expiresAt}`;

            if (!localStorage.getItem(noticeKey)) {
                addNotification(
                    'warning',
                    'Subscription expired',
                    'Your premium subscription has ended. Your account is now on the free plan.',
                    'premium.html'
                );
                await sendExpiryEmail(subscription, 'expired');
                localStorage.setItem(noticeKey, 'true');
            }

            downgradeToFree('expired');
            return;
        }

        const daysLeft = getDaysUntilExpiry(subscription);
        const reminderKey = `expiryReminderSent_${user.email}_${subscription.transactionId || subscription.expiresAt}`;

        if (daysLeft !== null && daysLeft <= EXPIRY_REMINDER_DAYS && daysLeft >= 0 && !localStorage.getItem(reminderKey)) {
            addNotification(
                'warning',
                'Subscription ending soon',
                `Your premium plan expires on ${formatDate(subscription.expiresAt)}.`,
                'premium.html'
            );
            await sendExpiryEmail(subscription, 'expiring');
            localStorage.setItem(reminderKey, 'true');
        }
    }

    function updateUsageBadges() {
        document.querySelectorAll('[data-subscription-status]').forEach(element => {
            const user = getCurrentUser();
            const premium = isPremium();
            element.textContent = premium ? user.subscription.planName || 'Premium' : 'Free';
            element.classList.toggle('premium', premium);
            element.classList.toggle('free', !premium);
        });

        document.querySelectorAll('[data-chat-limit-text]').forEach(element => {
            if (isPremium()) {
                element.textContent = 'Premium chat limit active';
            } else {
                element.textContent = `${getRemainingMessages()} of ${FREE_CHAT_LIMIT} free messages left today`;
            }
        });

        document.querySelectorAll('[data-subscription-expiry]').forEach(element => {
            const user = getCurrentUser();
            element.textContent = isPremium() ? formatDate(user.subscription.expiresAt) : 'Upgrade anytime';
        });
    }

    function init() {
        ensureNotificationCenter();
        updateNotificationCenter();
        updateUsageBadges();
        checkSubscriptionLifecycle();
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        PLANS,
        FREE_CHAT_LIMIT,
        activateSubscription,
        addNotification,
        canSendChatMessage,
        downgradeToFree,
        formatDate,
        getChatLimit,
        getCurrentUser,
        getDaysUntilExpiry,
        getNotifications,
        getRemainingMessages,
        getTodayUsage,
        isPremium,
        recordChatMessage,
        runDemoPayment,
        saveCurrentUser,
        sendExpiryEmail,
        updateUsageBadges
    };
})();

window.SubscriptionService = SubscriptionService;
