const SubscriptionService = (() => {
    const FREE_CHAT_LIMIT = 20;
    const EXPIRY_REMINDER_DAYS = 3;
    const REMOTE_SYNC_INTERVAL_MS = 15000;
    const API_BASE_URL = 'http://localhost:3000/api';
    const PREMIUM_FEATURES = [
        'Full Chat History',
        'Event Reminders',
        'Fee Challan Generator',
        'Application Forms',
        'Higher Chat Limit'
    ];
    let remoteSyncTimer = null;

    const PLANS = {
        weekly: { id: 'weekly', name: 'Weekly Premium', durationDays: 7, price: 199, currency: 'PKR', chatLimit: 200 },
        monthly: { id: 'monthly', name: 'Monthly Premium', durationDays: 30, price: 499, currency: 'PKR', chatLimit: 1000 }
    };

    function readJSON(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch (error) { return fallback; }
    }

    function writeJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function todayKey() { return new Date().toISOString().slice(0, 10); }

    function formatDate(value) {
        if (!value) return 'Not active';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Not active';
        return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function getAuthToken() {
        return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || (window.AuthService?.getToken?.()) || '';
    }

    async function apiRequest(path, options = {}) {
        const token = getAuthToken();
        if (!token) {
            const error = new Error('Authentication required.');
            error.status = 401;
            throw error;
        }

        const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
        if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

        const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
        let payload = {};
        try { payload = await response.json(); } catch (e) { payload = {}; }

        if (!response.ok) {
            const error = new Error(payload.error || 'Request failed.');
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    function getCurrentUser() {
        const currentUser = readJSON('currentUser', null);
        const email = currentUser?.email || localStorage.getItem('userEmail') || '';
        const role = currentUser?.role || localStorage.getItem('userRole') || 'student';
        return {
            ...(currentUser || {}),
            email, role,
            name: currentUser?.name || (email ? email.split('@')[0] : 'User'),
            subscription: currentUser?.subscription || { status: 'free' },
            features: currentUser?.features || []
        };
    }

    function saveCurrentUser(user) {
        if (!user?.email) return;
        writeJSON('currentUser', user);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userRole', user.role || 'student');
    }

    function isPremium() {
        const user = getCurrentUser();
        const sub = user.subscription;
        if (!sub || sub.status !== 'premium' || !sub.expiresAt) return false;
        return new Date(sub.expiresAt).getTime() > Date.now();
    }

    function getChatLimit() {
        return isPremium() ? (getCurrentUser().subscription?.chatLimit || 1000) : FREE_CHAT_LIMIT;
    }

    function getTodayUsage() {
        const user = getCurrentUser();
        if (!user.email) return 0;
        return Number(localStorage.getItem(`chatUsage_${user.email}_${todayKey()}`) || 0);
    }

    function getRemainingMessages() {
        if (isPremium()) return Infinity;
        return Math.max(FREE_CHAT_LIMIT - getTodayUsage(), 0);
    }

    function canSendChatMessage() {
        if (isPremium()) return { allowed: true, remaining: Infinity };
        const used = getTodayUsage();
        return { allowed: used < FREE_CHAT_LIMIT, remaining: Math.max(FREE_CHAT_LIMIT - used, 0), limit: FREE_CHAT_LIMIT };
    }

    function recordChatMessage() {
        if (isPremium()) return;
        const user = getCurrentUser();
        if (!user.email) return;
        const key = `chatUsage_${user.email}_${todayKey()}`;
        localStorage.setItem(key, String(getTodayUsage() + 1));
        updateUsageBadges();
    }

    function getNotificationKey() {
        const user = getCurrentUser();
        return `siteNotifications_${user.email || 'guest'}`;
    }

    function getNotifications() { return readJSON(getNotificationKey(), []); }
    function saveNotifications(notifications) { writeJSON(getNotificationKey(), notifications); }

    function showToast(notification) {
        let host = document.querySelector('.site-toast-host') || (() => {
            const h = document.createElement('div');
            h.className = 'site-toast-host';
            document.body.appendChild(h);
            return h;
        })();

        const toast = document.createElement('div');
        toast.className = `site-toast ${notification.type || 'info'}`;
        toast.innerHTML = `<strong>${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.message)}</span>`;
        host.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 20);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    function addNotification(type, title, message, link = null) {
        const notifications = getNotifications();
        const n = {
            id: `local-${Date.now()}`,
            source: 'local',
            type, title, message, link,
            read: false,
            createdAt: new Date().toISOString()
        };
        notifications.unshift(n);
        saveNotifications(notifications.slice(0, 30));
        showToast(n);
        updateNotificationCenter();
    }

    function ensureNotificationCenter() {
        if (document.getElementById('site-notification-center')) return;
        if (!document.body.classList.contains('protected-page') && !document.querySelector('.dashboard-layout')) return;

        const center = document.createElement('div');
        center.id = 'site-notification-center';
        center.className = 'site-notification-center';
        center.innerHTML = `
            <button type="button" class="notification-toggle">
                <i class="fas fa-bell"></i>
                <span class="notification-count" hidden>0</span>
            </button>
            <div class="notification-panel">
                <div class="notification-panel-header">
                    <strong>Notifications</strong>
                    <button type="button" class="notification-clear">Clear all</button>
                </div>
                <div class="notification-list"></div>
            </div>
        `;
        document.body.appendChild(center);

        const toggle = center.querySelector('.notification-toggle');
        toggle.addEventListener('click', e => { 
            e.stopPropagation(); 
            center.classList.toggle('open'); 
            if (center.classList.contains('open')) {
                markAllAsRead();
            }
        });
        center.querySelector('.notification-clear').addEventListener('click', async () => {
            await deleteAllNotifications();
            updateNotificationCenter();
        });
        document.addEventListener('click', e => { if (!center.contains(e.target)) center.classList.remove('open'); });
    }

    function updateNotificationCenter() {
        const center = document.getElementById('site-notification-center');
        if (!center) return;
        const notifications = getNotifications();
        const unreadCount = notifications.filter(n => !n.read).length;
        const count = center.querySelector('.notification-count');
        const list = center.querySelector('.notification-list');
        count.textContent = unreadCount;
        count.hidden = unreadCount === 0;

        if (notifications.length === 0) {
            list.innerHTML = '<p class="notification-empty">No notifications yet.</p>';
            return;
        }

        list.innerHTML = notifications.map(n => `
            <div class="notification-item ${n.read ? '' : 'unread'}">
                <div class="notification-content">
                    <strong>${escapeHtml(n.title)}</strong>
                    <span>${escapeHtml(n.message)}</span>
                    <small>${escapeHtml(formatDate(n.createdAt))}</small>
                </div>
            </div>
        `).join('');
    }

    async function refreshSubscriptionState() {
        if (!getAuthToken()) return null;
        try {
            const payload = await apiRequest('/subscription/current');
            const sub = payload.subscription;
            const premium = sub?.isPremium;
            const user = getCurrentUser();
            user.subscription = premium ? {
                status: 'premium',
                planId: sub.planCode,
                planName: sub.planName,
                expiresAt: sub.expiresAt,
                chatLimit: sub.chatLimit
            } : { status: 'free' };
            user.features = premium ? PREMIUM_FEATURES : [];
            saveCurrentUser(user);
            updateUsageBadges();
            return user.subscription;
        } catch (e) { return null; }
    }

    async function syncRemoteState() {
        if (!getAuthToken()) return;
        try {
            await refreshSubscriptionState();
            const payload = await apiRequest('/subscription/notifications');
            const serverNotifications = (payload.notifications || []).map(n => ({
                id: `sql-${n.notificationId}`,
                source: 'sql',
                type: n.type || 'info',
                title: n.title,
                message: n.message,
                read: Boolean(n.isRead),
                createdAt: n.createdAt
            }));

            const oldNotifications = getNotifications();
            const oldUnreadIds = new Set(oldNotifications.filter(n => !n.read).map(n => n.id));
            
            const fingerprints = new Set(serverNotifications.map(s => `${s.title}|${s.message}`));
            const merged = [...serverNotifications, ...oldNotifications.filter(e => e.source !== 'sql' && !fingerprints.has(`${e.title}|${e.message}`))]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
            
            saveNotifications(merged);
            
            const newUnread = merged.filter(n => !n.read && !oldUnreadIds.has(n.id));
            if (newUnread.length > 0) {
                showToast(newUnread[0]);
            }
            
            updateNotificationCenter();
        } catch (e) { console.warn('Sync failed:', e); }
    }

    async function markAllAsRead() {
        if (!getAuthToken()) return;
        try {
            await apiRequest('/subscription/notifications/read-all', { method: 'PATCH' });
            const notifications = getNotifications();
            notifications.forEach(n => n.read = true);
            saveNotifications(notifications);
            updateNotificationCenter();
        } catch (e) { console.error('Mark all read failed:', e); }
    }

    async function deleteAllNotifications() {
        if (!getAuthToken()) return;
        try {
            await apiRequest('/subscription/notifications', { method: 'DELETE' });
            saveNotifications([]);
        } catch (e) { console.error('Delete all notifications failed:', e); }
    }

    function updateUsageBadges() {
        const premium = isPremium();
        const user = getCurrentUser();
        document.querySelectorAll('[data-subscription-status]').forEach(el => {
            el.textContent = premium ? user.subscription.planName || 'Premium' : 'Free';
            el.classList.toggle('premium', premium);
            el.classList.toggle('free', !premium);
        });
        document.querySelectorAll('[data-chat-limit-text]').forEach(el => {
            el.textContent = premium ? 'Premium chat limit active' : `${getRemainingMessages()} of ${FREE_CHAT_LIMIT} free messages left today`;
        });
        document.querySelectorAll('[data-subscription-expiry]').forEach(el => {
            el.textContent = premium ? formatDate(user.subscription.expiresAt) : 'Upgrade anytime';
        });
    }

    function init() {
        ensureNotificationCenter();
        updateNotificationCenter();
        syncRemoteState();
        if (remoteSyncTimer) clearInterval(remoteSyncTimer);
        remoteSyncTimer = setInterval(syncRemoteState, REMOTE_SYNC_INTERVAL_MS);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

    return {
        init,
        isPremium,
        canSendChatMessage,
        recordChatMessage,
        getRemainingMessages,
        getCurrentUser,
        updateUsageBadges,
        refreshSubscriptionState,
        syncRemoteState,
        refreshNotifications: syncRemoteState,
        addNotification,
        apiRequest,
        PLANS,
        activateSubscription: (planId) => {
            const plan = PLANS[planId] || PLANS.monthly;
            const user = getCurrentUser();
            user.subscription = {
                status: 'premium',
                planId: plan.id,
                planName: plan.name,
                expiresAt: new Date(Date.now() + plan.durationDays * 86400000).toISOString(),
                chatLimit: plan.chatLimit
            };
            user.features = PREMIUM_FEATURES;
            saveCurrentUser(user);
            updateUsageBadges();
        }
    };
})();
window.SubscriptionService = SubscriptionService;
