const currentUser = (window.AuthService?.getCurrentUser?.() || JSON.parse(localStorage.getItem('currentUser') || 'null') || {});

const ADMIN_API_BASE = 'http://localhost:3000/api/admin';

const state = {
    authUsers: [],
    authUsersLoaded: false,
    authUsersError: null,
    manualPayments: [],
    adminSubscriptions: [],
    subscriptionAdminLoaded: false,
    subscriptionAdminError: null,
    subscriptionActiveTab: 'pending', // 'pending', 'active', 'history'
    meta: {
        intents: [],
        departments: [],
        eventTypes: [],
        semesters: [],
        programs: [],
        feeTypes: [],
        scholarshipTypes: []
    },
    departments: [],
    programs: [],
    feeStructures: [],
    scholarships: [],
    events: [],
    feedback: [],
    filters: {
        users: { search: '', role: 'all', status: 'all' },
        departments: { search: '' },
        programs: { search: '', status: 'all', department: 'all' },
        feeStructures: { search: '', status: 'all', program: 'all', feeType: 'all' },
        scholarships: { search: '', status: 'all', semester: 'all', type: 'all' },
        events: { search: '', status: 'all', type: 'all', registration: 'all' }
    },
    editing: {
        departments: null,
        programs: null,
        feeStructures: null,
        scholarships: null,
        events: null
    },
    modes: {
        departments: 'home',
        programs: 'home',
        feeStructures: 'home',
        scholarships: 'home',
        events: 'home'
    },
    notices: {
        users: null,
        subscriptions: null,
        departments: null,
        programs: null,
        feeStructures: null,
        scholarships: null,
        events: null
    }
};

const users = JSON.parse(localStorage.getItem('users') || '[]');

function getAdminHeaders() {
    const token = window.AuthService?.getToken?.() || localStorage.getItem('authToken') || '';
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    };
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${ADMIN_API_BASE}${path}`, {
        ...options,
        headers: {
            ...getAdminHeaders(),
            ...(options.headers || {})
        }
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok) {
        const error = new Error(payload.error || `Request failed (Status: ${response.status})`);
        error.details = payload.details || {};
        error.status = response.status;
        throw error;
    }

    return payload;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toInputDate(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
}

function formatDate(value) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(value, currency = 'PKR') {
    const amount = Number(value || 0);
    return `${currency || 'PKR'} ${amount.toLocaleString('en-PK', {
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        maximumFractionDigits: 2
    })}`;
}

function formatPaymentMethod(value) {
    return String(value || 'other')
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function paymentStatusBadge(status) {
    const normalized = String(status || 'pending').toLowerCase();
    const className = normalized === 'approved'
        ? 'active'
        : normalized === 'pending'
            ? 'warning'
            : normalized === 'rejected'
                ? 'inactive'
                : 'muted';

    return `<span class="status-badge ${className}">${escapeHtml(normalized)}</span>`;
}

function activeBadge(isActive) {
    return `<span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>`;
}

function registrationBadge(value) {
    return `<span class="status-badge ${value ? 'info' : 'muted'}">${value ? 'Registration On' : 'Walk-in / Not Required'}</span>`;
}

const ADMIN_SECTION_IDS = new Set([
    'overview',
    'users',
    'subscriptions',
    'departments',
    'programs',
    'feeStructures',
    'scholarships',
    'events',
    'feedback'
]);

function getSectionFromHash() {
    const hash = window.location.hash.replace('#', '');
    return ADMIN_SECTION_IDS.has(hash) ? hash : 'overview';
}

function setSection(sectionId, options = {}) {
    const nextSection = ADMIN_SECTION_IDS.has(sectionId) ? sectionId : 'overview';

    document.querySelectorAll('.sidebar-menu a[data-section]').forEach(link => {
        link.classList.toggle('active', link.dataset.section === nextSection);
    });

    document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === nextSection);
    });

    if (options.updateHash) {
        const baseUrl = window.location.href.split('#')[0];
        const nextUrl = nextSection === 'overview'
            ? baseUrl
            : `${baseUrl}#${nextSection}`;

        window.history.replaceState(null, '', nextUrl);
    }
}


// CustomModal is now provided by js/modal.js


function attachNavigation() {
    document.querySelectorAll('.sidebar-menu a[data-section]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            setSection(link.dataset.section, { updateHash: true });
        });
    });

    document.querySelectorAll('.action-card[data-action]').forEach(card => {
        card.addEventListener('click', () => {
            setSection(card.dataset.action, { updateHash: true });
        });
    });

    window.addEventListener('hashchange', () => {
        setSection(getSectionFromHash(), { updateHash: false });
    });
}

function setCrudMode(sectionKey, mode) {
    state.modes[sectionKey] = mode;
    if (mode !== 'edit') {
        state.editing[sectionKey] = null;
    }
}

function renderCrudModeChooser(sectionKey, labels = {}) {
    const activeMode = state.modes[sectionKey];
    const actions = [
        { key: 'browse', title: labels.browseTitle || 'Browse Records', text: labels.browseText || 'Open the record list with search and filters in one place.', icon: 'fa-table-list' },
        { key: 'add', title: labels.addTitle || 'Add New', text: labels.addText || 'Create a new record with a dedicated form.' },
        { key: 'edit', title: labels.editTitle || 'Edit Existing', text: labels.editText || 'Choose a record first, then update it in a separate form.', icon: 'fa-pen-to-square' },
        { key: 'deactivate', title: labels.deactivateTitle || 'Deactivate / Delete', text: labels.deactivateText || 'Open only the safe removal actions for this module.', icon: 'fa-ban' }
    ];

    const iconMap = {
        browse: 'fa-table-list',
        add: 'fa-circle-plus',
        edit: 'fa-pen-to-square',
        deactivate: 'fa-ban'
    };

    return `
        <div class="crud-mode-shell">
            <div class="mode-home-card ${activeMode === 'home' ? 'active' : ''}">
                <div>
                    <h3>${escapeHtml(labels.homeTitle || 'Choose What You Want To Do')}</h3>
                    <p>${escapeHtml(labels.homeText || 'Select one action below and we will open only that workspace for you.')}</p>
                </div>
                ${activeMode !== 'home' ? '<button type="button" class="ghost-btn" data-crud-mode="home">Back To Actions</button>' : ''}
            </div>
            <div class="mode-grid">
                ${actions.map(action => `
                    <button type="button" class="mode-card ${activeMode === action.key ? 'active' : ''}" data-crud-mode="${action.key}">
                        <i class="fa-solid ${action.icon || iconMap[action.key] || 'fa-sliders'}"></i>
                        <strong>${escapeHtml(action.title)}</strong>
                        <span>${escapeHtml(action.text)}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function attachCrudModeHandlers(section, sectionKey, renderFn) {
    section.querySelectorAll('[data-crud-mode]').forEach(button => {
        button.addEventListener('click', () => {
            setCrudMode(sectionKey, button.dataset.crudMode);
            renderFn();
        });
    });
}

function setOverviewCounts() {
    const activeSubscriptionCount = state.subscriptionAdminLoaded && !state.subscriptionAdminError
        ? state.adminSubscriptions.filter(item => item.status === 'active').length
        : 0;

    const pendingRequestsCount = state.subscriptionAdminLoaded && !state.subscriptionAdminError
        ? state.manualPayments.filter(item => item.status === 'pending').length
        : 0;

    document.getElementById('statUsers').innerText = state.authUsersLoaded ? state.authUsers.length : 0;
    document.getElementById('statFeedback').innerText = state.feedback ? state.feedback.length : 0;
    document.getElementById('statSubs').innerText = activeSubscriptionCount;

    // Sidebar Badge
    const subsBadge = document.getElementById('subsBadge');
    if (subsBadge) {
        if (pendingRequestsCount > 0) {
            subsBadge.innerText = pendingRequestsCount;
            subsBadge.style.display = 'flex';
        } else {
            subsBadge.style.display = 'none';
        }
    }
}

function renderUsersSection() {
    const section = document.getElementById('users');
    const authUsers = state.authUsers;
    const currentUserId = Number(currentUser.userId || 0);
    const notice = state.notices.users;
    const filter = state.filters.users;

    // 1. Filter Logic
    const filteredUsers = authUsers.filter(user => {
        const matchesSearch = !filter.search ||
            (user.full_name || '').toLowerCase().includes(filter.search.toLowerCase()) ||
            (user.email || '').toLowerCase().includes(filter.search.toLowerCase());
        const matchesRole = filter.role === 'all' || user.role === filter.role;
        const matchesStatus = filter.status === 'all' ||
            (filter.status === 'active' && user.is_active) ||
            (filter.status === 'inactive' && !user.is_active);
        return matchesSearch && matchesRole && matchesStatus;
    });

    // 2. Stats Calculation
    const totalUsers = authUsers.length;
    const adminCount = authUsers.filter(u => u.role === 'admin').length;
    const activeCount = authUsers.filter(u => u.is_active).length;

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>Users Management</h2>
                    <p>Manage authentication accounts and system permissions.</p>
                </div>
            </div>

            ${notice ? `<div class="success-banner">${escapeHtml(notice)}</div>` : ''}

            <!-- User Stats Summary -->
            <div class="stats-summary-bar">
                <div class="stat-box">
                    <i class="fas fa-users"></i>
                    <div class="stat-info">
                        <h4>Total Accounts</h4>
                        <p>${totalUsers}</p>
                    </div>
                </div>
                <div class="stat-box">
                    <i class="fas fa-user-shield"></i>
                    <div class="stat-info">
                        <h4>Admins</h4>
                        <p>${adminCount}</p>
                    </div>
                </div>
                <div class="stat-box">
                    <i class="fas fa-check-circle"></i>
                    <div class="stat-info">
                        <h4>Active Accounts</h4>
                        <p>${activeCount}</p>
                    </div>
                </div>
            </div>

            <!-- Toolbar with Search & Filters -->
            <div class="section-toolbar search-redesign">
                <div class="toolbar-group">
                    <h3 class="search-label">Search</h3>
                    <div class="search-wrapper">
                        <div class="search-control">
                            <input type="text" id="userSearch" placeholder="Search name or email..." value="${escapeHtml(filter.search)}">
                        </div>
                        <button type="button" class="search-btn" id="userSearchBtn">Search</button>
                    </div>
                    <div class="filter-controls">
                        <label>
                            <span>Role</span>
                            <select id="userRoleFilter">
                                <option value="all" ${filter.role === 'all' ? 'selected' : ''}>All Roles</option>
                                <option value="admin" ${filter.role === 'admin' ? 'selected' : ''}>Admins</option>
                                <option value="student" ${filter.role === 'student' ? 'selected' : ''}>Students</option>
                            </select>
                        </label>
                        <label>
                            <span>Status</span>
                            <select id="userStatusFilter">
                                <option value="all" ${filter.status === 'all' ? 'selected' : ''}>All Status</option>
                                <option value="active" ${filter.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="inactive" ${filter.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </label>
                    </div>
                </div>
            </div>

            <!-- High Density User Table -->
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>User Details</th>
                            <th>Role</th>
                            <th>Last Login</th>
                            <th>Created</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${!state.authUsersLoaded
            ? '<tr><td colspan="6" class="empty-state">Loading users from database...</td></tr>'
            : filteredUsers.length === 0
                ? '<tr><td colspan="6" class="empty-state">No users match your filters.</td></tr>'
                : filteredUsers.map(user => {
                    const isSelf = Number(user.user_id) === currentUserId;
                    return `
                                    <tr>
                                        <td>
                                            <div class="table-user-info">
                                                <strong>${escapeHtml(user.full_name || 'User')}</strong>
                                                <span>${escapeHtml(user.email)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="status-badge ${user.role === 'admin' ? 'info' : 'muted'}">
                                                ${escapeHtml(user.role || 'student')}
                                            </span>
                                        </td>
                                        <td>${escapeHtml(formatDateTime(user.last_login_at))}</td>
                                        <td>${escapeHtml(formatDateTime(user.created_at))}</td>
                                        <td>
                                            <span class="status-badge ${user.is_active ? 'active' : 'inactive'}">
                                                ${user.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div class="table-actions">
                                                ${isSelf ? '<span class="muted-text">Current Account</span>' : `
                                                    <button class="icon-btn ${user.role === 'admin' ? 'warning' : 'primary'}" 
                                                            data-user-role="${user.user_id}" 
                                                            data-next-role="${user.role === 'admin' ? 'student' : 'admin'}"
                                                            title="${user.role === 'admin' ? 'Demote to Student' : 'Promote to Admin'}">
                                                        <i class="fas fa-user-tag"></i>
                                                    </button>
                                                    <button class="icon-btn ${user.is_active ? 'warning' : 'success'}" 
                                                            data-user-status="${user.user_id}" 
                                                            data-current-status="${user.is_active}"
                                                            title="${user.is_active ? 'Deactivate Account' : 'Activate Account'}">
                                                        <i class="fas fa-${user.is_active ? 'user-slash' : 'user-check'}"></i>
                                                    </button>
                                                    <button class="icon-btn danger" 
                                                            data-user-delete="${user.user_id}"
                                                            title="Delete Permanently">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                `}
                                            </div>
                                        </td>
                                    </tr>
                                    `;
                }).join('')
        }
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // 3. Attach Event Listeners

    // Real-time search removed to prevent focus loss. 
    // Use the Search button or press Enter to filter.

    // Search Button Listener
    section.querySelector('#userSearchBtn').addEventListener('click', () => {
        state.filters.users.search = section.querySelector('#userSearch').value.trim();
        renderUsersSection();
    });

    // Enter Key Listener for Search
    section.querySelector('#userSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            state.filters.users.search = e.target.value.trim();
            renderUsersSection();
        }
    });

    // Role Filter Listener
    section.querySelector('#userRoleFilter').addEventListener('change', (e) => {
        state.filters.users.role = e.target.value;
        renderUsersSection();
    });

    // Status Filter Listener
    section.querySelector('#userStatusFilter').addEventListener('change', (e) => {
        state.filters.users.status = e.target.value;
        renderUsersSection();
    });

    // Role Change Buttons
    section.querySelectorAll('[data-user-role]').forEach(button => {
        button.addEventListener('click', async () => {
            const userId = Number(button.dataset.userRole);
            const nextRole = button.dataset.nextRole;
            const promptText = nextRole === 'admin'
                ? 'Give this user admin access?'
                : 'Change this admin back to student?';

            if (!await CustomModal.confirm('Admin Action', promptText)) return;
            button.disabled = true;

            try {
                await apiRequest(`/users/${userId}/role`, {
                    method: 'PUT',
                    body: JSON.stringify({ role: nextRole })
                });
                state.notices.users = `User role updated to ${nextRole}.`;
                await loadAuthUsers();
                setOverviewCounts();
                renderUsersSection();
            } catch (error) {
                button.disabled = false;
                window.alert(error.message || 'Could not update the user role.');
            }
        });
    });

    // Status Change Buttons
    section.querySelectorAll('[data-user-status]').forEach(button => {
        button.addEventListener('click', async () => {
            const userId = Number(button.dataset.userStatus);
            const currentStatus = button.dataset.currentStatus === 'true';
            const nextStatus = !currentStatus;
            const promptText = nextStatus ? 'Activate this account?' : 'Deactivate this account?';

            if (!await CustomModal.confirm('Admin Action', promptText)) return;
            button.disabled = true;

            try {
                await apiRequest(`/users/${userId}/status`, {
                    method: 'PUT',
                    body: JSON.stringify({ isActive: nextStatus })
                });
                state.notices.users = `Account ${nextStatus ? 'activated' : 'deactivated'} successfully.`;
                await loadAuthUsers();
                renderUsersSection();
            } catch (error) {
                button.disabled = false;
                window.alert(error.message || 'Could not update status.');
            }
        });
    });

    // Delete Buttons
    section.querySelectorAll('[data-user-delete]').forEach(button => {
        button.addEventListener('click', async () => {
            const userId = Number(button.dataset.userDelete);
            if (!await CustomModal.confirm('Permanent Deletion', 'PERMANENTLY delete this user account? This cannot be undone.', { type: 'danger' })) return;

            button.disabled = true;
            try {
                await apiRequest(`/users/${userId}`, { method: 'DELETE' });
                state.notices.users = 'User deleted permanently.';
                await loadAuthUsers();
                setOverviewCounts();
                renderUsersSection();
            } catch (error) {
                button.disabled = false;
                window.alert(error.message || 'Delete failed.');
            }
        });
    });
}

function renderSubscriptionsSection() {
    const section = document.getElementById('subscriptions');
    const payments = state.manualPayments;
    const subscriptions = state.adminSubscriptions;
    const pendingRequests = payments.filter(p => p.status === 'pending');
    const activeSubs = subscriptions.filter(s => s.status === 'active');

    const notice = state.notices.subscriptions;
    const activeTab = state.subscriptionActiveTab;

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>Subscriptions Management</h2>
                    <p>Manage manual payment approvals and track premium subscriptions.</p>
                </div>
                <div class="section-meta">
                    <button type="button" class="secondary-btn" data-refresh-subscriptions>
                        <i class="fas fa-sync-alt"></i> Refresh Data
                    </button>
                </div>
            </div>

            ${notice ? `<div class="success-banner">${escapeHtml(notice)}</div>` : ''}

            <!-- Stats Bar -->
            <div class="stats-summary-bar">
                <div class="stat-box">
                    <i class="fas fa-clock"></i>
                    <div class="stat-info">
                        <h4>Pending Requests</h4>
                        <p>${pendingRequests.length}</p>
                    </div>
                </div>
                <div class="stat-box">
                    <i class="fas fa-user-check"></i>
                    <div class="stat-info">
                        <h4>Active Premiums</h4>
                        <p>${activeSubs.length}</p>
                    </div>
                </div>
                <div class="stat-box">
                    <i class="fas fa-history"></i>
                    <div class="stat-info">
                        <h4>Total Transactions</h4>
                        <p>${payments.filter(p => p.status === 'approved').length}</p>
                    </div>
                </div>
            </div>

            <!-- Tab Navigation -->
            <div class="tab-nav">
                <button class="tab-btn ${activeTab === 'pending' ? 'active' : ''}" data-tab="pending">
                    Pending Approvals (${pendingRequests.length})
                </button>
                <button class="tab-btn ${activeTab === 'active' ? 'active' : ''}" data-tab="active">
                    Active Subscriptions (${activeSubs.length})
                </button>
                <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" data-tab="history">
                    All History
                </button>
            </div>

            <div class="tab-content">
                ${renderSubscriptionTabContent()}
            </div>
        </div>
    `;

    // Event Listeners
    section.querySelector('[data-refresh-subscriptions]')?.addEventListener('click', async event => {
        const btn = event.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        await loadSubscriptionAdminData();
        setOverviewCounts();
        renderSubscriptionsSection();
    });

    section.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.subscriptionActiveTab = btn.dataset.tab;
            renderSubscriptionsSection();
        });
    });

    // Approval/Rejection Handlers
    section.querySelectorAll('[data-payment-approve]').forEach(button => {
        button.addEventListener('click', async () => {
            const paymentId = Number(button.dataset.paymentApprove);
            const note = await CustomModal.prompt('Approval Note', 'Optional admin note for approval:', { placeholder: 'Type your approval note here...' });
            if (note === null) return;
            if (!await CustomModal.confirm('Approve Payment', 'Approve this payment and activate premium access?')) return;
            button.disabled = true;
            try {
                await apiRequest(`/manual-payments/${paymentId}/approve`, {
                    method: 'PUT',
                    body: JSON.stringify({ adminNote: note })
                });
                state.notices.subscriptions = 'Payment approved and premium access activated.';
                await loadSubscriptionAdminData();
                setOverviewCounts();
                renderSubscriptionsSection();
            } catch (error) {
                button.disabled = false;
                window.alert(error.message || 'Could not approve payment.');
            }
        });
    });

    section.querySelectorAll('[data-payment-reject]').forEach(button => {
        button.addEventListener('click', async () => {
            const paymentId = Number(button.dataset.paymentReject);
            const note = await CustomModal.prompt('Rejection Reason', 'Add a short reason for rejection:', { defaultValue: 'Payment could not be verified.', placeholder: 'Why is this payment being rejected?' });
            if (note === null) return;
            if (!await CustomModal.confirm('Reject Payment', 'Reject this payment request?')) return;
            button.disabled = true;
            try {
                await apiRequest(`/manual-payments/${paymentId}/reject`, {
                    method: 'PUT',
                    body: JSON.stringify({ adminNote: note })
                });
                state.notices.subscriptions = 'Payment request rejected.';
                await loadSubscriptionAdminData();
                setOverviewCounts();
                renderSubscriptionsSection();
            } catch (error) {
                button.disabled = false;
                window.alert(error.message || 'Could not reject payment.');
            }
        });
    });

    // Cancellation Handler
    section.querySelectorAll('[data-subscription-cancel]').forEach(button => {
        button.addEventListener('click', async () => {
            const subId = Number(button.dataset.subscriptionCancel);
            const userEmail = button.dataset.userEmail;

            const reason = await CustomModal.prompt('Cancellation Reason', `Are you sure you want to cancel the subscription for ${userEmail}?`, { defaultValue: 'Manual cancellation by administrator.', placeholder: 'Enter reason for cancellation (sent to student)...' });

            if (reason === null) return; // Cancelled prompt

            if (!await CustomModal.confirm('Cancel Subscription', 'This will immediately revoke their premium access. Proceed?', { type: 'danger' })) return;

            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                await apiRequest(`/actions/cancel-subscription/${subId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ reason })
                });
                state.notices.subscriptions = `Subscription for ${userEmail} has been cancelled.`;
                await loadSubscriptionAdminData();
                setOverviewCounts();
                renderSubscriptionsSection();
            } catch (error) {
                button.disabled = false;
                button.innerText = 'Cancel';
                let msg = error.message || 'Could not cancel subscription.';
                if (error.details) msg += '\n\nDetails: ' + error.details;
                window.alert(msg);
            }
        });
    });

    // History Delete Handler
    section.querySelectorAll('[data-history-delete-id]').forEach(button => {
        button.addEventListener('click', async () => {
            const id = button.dataset.historyDeleteId;
            const type = button.dataset.historyDeleteType; // 'payment' or 'subscription'

            if (!await CustomModal.confirm('Delete History Record', `Are you sure you want to delete this ${type} record from history?`, { type: 'danger' })) return;

            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const endpoint = type === 'payment' ? `/manual-payments/${id}` : `/subscriptions/${id}`;
                await apiRequest(endpoint, { method: 'DELETE' });

                state.notices.subscriptions = 'History record deleted successfully.';
                await loadSubscriptionAdminData();
                setOverviewCounts();
                renderSubscriptionsSection();
            } catch (error) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-trash"></i>';
                window.alert(error.message || 'Could not delete history record.');
            }
        });
    });
}

function renderSubscriptionTabContent() {
    const tab = state.subscriptionActiveTab;

    if (!state.subscriptionAdminLoaded) {
        return '<div class="empty-state">Loading subscription data...</div>';
    }

    if (tab === 'pending') {
        const pending = state.manualPayments.filter(p => p.status === 'pending');
        if (pending.length === 0) return '<div class="empty-state">No pending payment requests.</div>';

        // Count pending requests per user to identify duplicates
        const pendingCounts = {};
        pending.forEach(p => {
            const email = p.userEmail?.toLowerCase();
            pendingCounts[email] = (pendingCounts[email] || 0) + 1;
        });

        return `
            <div class="admin-list">
                ${pending.map(payment => {
            const isDuplicate = (pendingCounts[payment.userEmail?.toLowerCase()] || 0) > 1;
            return `
                        <div class="record-card simple-card ${isDuplicate ? 'warning-border' : ''}">
                            <div class="record-main">
                                <div class="record-topline">
                                    <h3>${escapeHtml(payment.userName || payment.userEmail || 'Student')}</h3>
                                    <div style="display: flex; gap: 8px; align-items: center;">
                                        ${isDuplicate ? '<span class="status-badge warning" title="This user has multiple pending requests">Multiple Requests</span>' : ''}
                                        ${paymentStatusBadge(payment.status)}
                                    </div>
                                </div>
                                <div class="record-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                                    <div>
                                        <p><strong>Email:</strong> ${escapeHtml(payment.userEmail)}</p>
                                        <p><strong>Plan:</strong> ${escapeHtml(payment.planName)}</p>
                                        <p><strong>Amount:</strong> ${escapeHtml(formatCurrency(payment.amount, payment.currency))}</p>
                                        <p><strong>Method:</strong> ${escapeHtml(formatPaymentMethod(payment.paymentMethod))}</p>
                                    </div>
                                    <div>
                                        <p><strong>Reference:</strong> ${escapeHtml(payment.transactionReference || 'N/A')}</p>
                                        <p><strong>Sender:</strong> ${escapeHtml(payment.senderAccountName || 'N/A')}</p>
                                        <p><strong>Submitted:</strong> ${escapeHtml(formatDateTime(payment.submittedAt))}</p>
                                        ${payment.proofFilePath ? `<p><strong>Proof:</strong> <a href="${escapeHtml(`http://localhost:3000${payment.proofFilePath}`)}" target="_blank" class="text-link">View Screenshot</a></p>` : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="record-actions">
                                <button type="button" class="primary-btn" data-payment-approve="${payment.paymentId}">Approve</button>
                                <button type="button" class="danger-btn" data-payment-reject="${payment.paymentId}">Reject</button>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    if (tab === 'active') {
        const active = state.adminSubscriptions.filter(s => s.status === 'active');
        if (active.length === 0) return '<div class="empty-state">No active premium subscriptions.</div>';

        return `
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Plan</th>
                            <th>Started</th>
                            <th>Expires</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${active.map(sub => `
                            <tr>
                                <td>
                                    <div class="table-user-info">
                                        <strong>${escapeHtml(sub.userName || 'User')}</strong>
                                        <span>${escapeHtml(sub.userEmail)}</span>
                                    </div>
                                </td>
                                <td>${escapeHtml(sub.planName)}</td>
                                <td>${escapeHtml(formatDateTime(sub.startedAt))}</td>
                                <td>${escapeHtml(formatDateTime(sub.expiresAt))}</td>
                                <td><span class="status-badge active">Active</span></td>
                                <td>
                                    <button type="button" class="danger-btn" 
                                            data-subscription-cancel="${sub.subscriptionId}" 
                                            data-user-email="${escapeHtml(sub.userEmail)}">
                                        Cancel
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    if (tab === 'history') {
        // Create a unified history list from both payments and subscriptions
        const historyItems = [];

        // Add all manual payments
        state.manualPayments.forEach(pay => {
            historyItems.push({
                id: pay.paymentId,
                date: pay.submittedAt,
                userName: pay.userName,
                userEmail: pay.userEmail,
                planName: pay.planName,
                amount: pay.amount,
                currency: pay.currency,
                status: pay.status,
                type: 'payment'
            });
        });

        // Add cancelled/expired subscriptions to ensure they show up even if payment was approved
        state.adminSubscriptions.filter(s => s.status !== 'active').forEach(sub => {
            historyItems.push({
                id: sub.subscriptionId,
                date: sub.updatedAt || sub.createdAt,
                userName: sub.userName,
                userEmail: sub.userEmail,
                planName: sub.planName,
                amount: sub.price,
                currency: sub.currency,
                status: sub.status,
                type: 'subscription'
            });
        });

        // Sort by date descending
        historyItems.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (historyItems.length === 0) return '<div class="empty-state">No transaction history.</div>';

        return `
            <div class="data-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>User</th>
                            <th>Plan</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyItems.map(item => `
                            <tr>
                                <td>${escapeHtml(formatDateTime(item.date))}</td>
                                <td>
                                    <div class="table-user-info">
                                        <strong>${escapeHtml(item.userName || 'User')}</strong>
                                        <span>${escapeHtml(item.userEmail)}</span>
                                    </div>
                                </td>
                                <td>${escapeHtml(item.planName)}</td>
                                <td>${escapeHtml(formatCurrency(item.amount, item.currency))}</td>
                                <td>${paymentStatusBadge(item.status)}</td>
                                <td>
                                    ${(item.status === 'active' || item.status === 'approved') ?
                '<span class="muted-text" title="Active records cannot be deleted from history">Protected</span>' :
                `<button type="button" class="icon-btn danger" 
                                                data-history-delete-id="${item.id}" 
                                                data-history-delete-type="${item.type}"
                                                title="Delete history record">
                                            <i class="fas fa-trash"></i>
                                        </button>`
            }
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
}

async function loadFeedback() {
    try {
        state.feedback = await apiRequest('/feedback');
    } catch (error) {
        console.error('Failed to load feedback:', error);
        state.feedback = [];
    }
}

async function handleFeedbackDelete(feedbackId) {
    if (!await CustomModal.confirm('Delete Feedback', 'Are you sure you want to delete this feedback?', { type: 'danger' })) return;

    try {
        await apiRequest(`/feedback/${feedbackId}`, { method: 'DELETE' });
        await loadFeedback();
        renderFeedbackSection();
        setOverviewCounts();
    } catch (error) {
        alert(error.message || 'Failed to delete feedback.');
    }
}

function renderFeedbackSection() {
    const section = document.getElementById('feedback');
    const feedbackList = state.feedback || [];

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>User Feedback</h2>
                    <p>Review student feedback and ratings from the backend database.</p>
                </div>
                <div class="section-meta">
                    <button class="secondary-btn icon-btn-text" id="refreshFeedback">
                        <i class="fas fa-sync-alt"></i> <span>Refresh</span>
                    </button>
                    <span class="meta-count">${feedbackList.length} feedback entries</span>
                </div>
            </div>
            
            <div class="data-table-container feedback-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Rating</th>
                            <th>Message</th>
                            <th>Date</th>
                            <th class="actions-cell">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${feedbackList.length === 0 ? `
                            <tr>
                                <td colspan="5" class="empty-row">No feedback records found.</td>
                            </tr>
                        ` : feedbackList.map(item => `
                            <tr>
                                <td>
                                    <div class="table-user-info">
                                        <strong>${escapeHtml(item.user_name || 'Anonymous')}</strong>
                                        <span>${escapeHtml(item.user_email || 'No email')}</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="rating-badge rating-${item.rating}">
                                        ${item.rating} <i class="fas fa-star"></i>
                                    </span>
                                </td>
                                <td>
                                    <div class="feedback-message-cell" title="${escapeHtml(item.message || '')}">
                                        ${escapeHtml(item.message || 'No message provided.')}
                                    </div>
                                </td>
                                <td>
                                    <span class="date-text">${escapeHtml(formatDate(item.created_at))}</span>
                                </td>
                                <td class="actions-cell">
                                    <div class="table-actions">
                                        <button class="icon-btn danger" data-delete-feedback="${item.feedback_id}" title="Delete Feedback">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    section.querySelector('#refreshFeedback')?.addEventListener('click', async () => {
        await loadFeedback();
        renderFeedbackSection();
    });

    section.querySelectorAll('[data-delete-feedback]').forEach(button => {
        button.addEventListener('click', () => {
            handleFeedbackDelete(button.dataset.deleteFeedback);
        });
    });
}

function renderSectionError(sectionId, message) {
    const section = document.getElementById(sectionId);
    section.innerHTML = `
        <div class="card section-card">
            <div class="error-banner">${escapeHtml(message)}</div>
        </div>
    `;
}

function getSelectedText(select, fallback = 'Unselected') {
    const option = select?.options?.[select.selectedIndex];
    return option ? option.text : fallback;
}

function renderFieldErrors(details = {}) {
    const entries = Object.entries(details);
    if (entries.length === 0) return '';
    return `
        <div class="form-errors">
            ${entries.map(([field, message]) => `<div><strong>${escapeHtml(field)}:</strong> ${escapeHtml(message)}</div>`).join('')}
        </div>
    `;
}

function buildSearchControl(id, value, placeholder) {
    return `
        <label class="search-control" for="${id}">
            <span>Search</span>
            <div class="search-input-group">
                <input type="search" id="${id}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
                <button type="submit" class="secondary-btn search-submit-btn">Search</button>
            </div>
        </label>
    `;
}

function buildProgramFollowUpNotice(programPayload, mode = 'create') {
    const label = programPayload.program_name || 'this program';
    const actionLabel = mode === 'update' ? 'updated' : 'added';

    return {
        title: `Program ${actionLabel} successfully`,
        intro: `${label} has been saved. To keep the chatbot and admin data consistent, please review the related areas below.`,
        adminTasks: [
            'Review fee structure if this program has tuition, exam, lab, admission, or security charges.',
            'Review fee schedule if this program needs semester-wise deadlines, late fee, or grace period data.',
            'Review FAQ answers if students are likely to ask about eligibility, duration, seats, or fee details for this program.',
            'Review training examples so admin suggestions and fallback prompts mention this program naturally.'
        ],
        developerTasks: [
            'Developer review may still be needed if the chatbot does not yet recognize this program name in Rasa training data.',
            'Developer review may still be needed if any backend program-name matching logic is currently hardcoded for older program names only.'
        ]
    };
}

function buildDepartmentFollowUpNotice(departmentPayload, mode = 'create') {
    const label = departmentPayload.dept_name || 'this department';
    const actionLabel = mode === 'update' ? 'updated' : 'added';

    return {
        title: `Department ${actionLabel} successfully`,
        intro: `${label} has been saved. Please review the related areas below so department details stay complete for both admin use and chatbot answers.`,
        adminTasks: [
            'Review programs if any existing or upcoming program should now be linked to this department.',
            'Review FAQ answers if this department should have office, HOD, contact, or location-related answers.',
            'Review training examples if students may ask for this department using different names or abbreviations.'
        ],
        developerTasks: [
            'Developer review may be needed if this department introduces new chatbot phrasing that is not yet reflected in Rasa training data.',
            'Developer review may be needed if the chatbot uses any hardcoded department matching that does not yet include this department.'
        ]
    };
}

function buildEventFollowUpNotice(eventPayload, mode = 'create') {
    const label = eventPayload.event_name || 'this event';
    const actionLabel = mode === 'update' ? 'updated' : 'added';

    return {
        title: `Event ${actionLabel} successfully`,
        intro: `${label} has been saved. Please review the related areas below so event information stays clear for admins and end users.`,
        adminTasks: [
            'Review whether registration details, venue, and deadlines are complete before the event is announced.',
            'Review FAQ answers if users may ask about this event in a general way and need a broad answer beyond the record itself.',
            'Review event timing later if schedules change, so outdated dates are not shown in the chatbot.'
        ],
        developerTasks: [
            'Developer review may be needed if the event should be surfaced through new intent examples or event-specific chatbot prompts.',
            'Developer review may be needed if event phrasing in the chatbot should be broadened beyond the current stored event labels.'
        ]
    };
}

function buildFeeStructureFollowUpNotice(payload, mode = 'create') {
    const label = payload.program_label || 'the selected program';
    const actionLabel = mode === 'update' ? 'updated' : 'added';

    return {
        title: `Fee structure ${actionLabel} successfully`,
        intro: `The fee record for ${label} has been saved. Please review the related areas below so fee answers stay consistent for students and admins.`,
        adminTasks: [
            'Review whether this program now has all required fee components such as tuition, exam, lab, admission, and security charges.',
            'Review fee schedule if deadlines, late fee, or grace period should also be updated for the same program.',
            'Review FAQ answers if students ask broad fee questions that should mention the updated structure.'
        ],
        developerTasks: [
            'Developer review may be needed if new fee types were added outside the existing chatbot phrasing.',
            'Developer review may be needed if fee calculations or summaries in dynamic answers should be expanded later.'
        ]
    };
}

function buildScholarshipFollowUpNotice(payload, mode = 'create') {
    const label = payload.scholarship_type_label || 'the selected scholarship';
    const actionLabel = mode === 'update' ? 'updated' : 'added';

    return {
        title: `Scholarship ${actionLabel} successfully`,
        intro: `${label} has been saved. Please review the related areas below so scholarship guidance remains accurate and timely.`,
        adminTasks: [
            'Review deadlines, interview date, and announcement date before the scholarship is shared with students.',
            'Review max beneficiaries and active status so only valid scholarship cycles are shown.',
            'Review FAQ answers if this scholarship needs general explanation beyond the structured record.'
        ],
        developerTasks: [
            'Developer review may be needed if new scholarship phrasing should be added to Rasa training data.',
            'Developer review may be needed if scholarship-type coverage in dynamic answers should be broadened later.'
        ]
    };
}

function getFilteredDepartments() {
    const search = state.filters.departments.search.toLowerCase();
    return state.departments.filter(item => {
        if (!search) return true;
        return [item.dept_name, item.head_name, item.contact_number, item.email, item.block_location, item.room_number]
            .join(' ')
            .toLowerCase()
            .includes(search);
    });
}

function renderDepartmentsSection(formErrors = {}, globalError = '') {
    const section = document.getElementById('departments');
    const editingId = state.editing.departments;
    const currentRecord = editingId ? state.departments.find(item => item.department_id === editingId) : null;
    const filteredItems = getFilteredDepartments();
    const mode = state.modes.departments;
    const showToolbar = mode === 'browse';
    const showForm = mode === 'add' || (mode === 'edit' && currentRecord);
    const showList = ['browse', 'edit', 'deactivate'].includes(mode);
    const notice = state.notices.departments;

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>Departments</h2>
                    <p>Maintain department contacts, office locations, and HOD details used by the chatbot and admin team.</p>
                </div>
                <div class="section-meta">
                    <span>${state.departments.length} departments</span>
                </div>
            </div>
            ${globalError ? `<div class="error-banner">${escapeHtml(globalError)}</div>` : ''}
            ${renderCrudModeChooser('departments', {
        homeText: 'Choose one department management task and we will open that workspace only.',
        browseTitle: 'Browse Records',
        browseText: 'Review departments and use search to find a specific office or contact quickly.',
        addText: 'Show only the add-department form.',
        editText: 'Pick a department to edit and then open its form separately.',
        deactivateText: 'Open only department removal actions.'
    })}
            ${notice ? `
            <div class="followup-notice">
                <div class="followup-notice__header">
                    <div>
                        <h3>${escapeHtml(notice.title)}</h3>
                        <p>${escapeHtml(notice.intro)}</p>
                    </div>
                    <button type="button" class="ghost-btn" id="dismissDepartmentNotice">Dismiss</button>
                </div>
                <div class="followup-grid">
                    <div class="followup-card">
                        <h4>Admin Should Review</h4>
                        <ul>${notice.adminTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                    <div class="followup-card followup-card--soft">
                        <h4>Developer Awareness</h4>
                        <ul>${notice.developerTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                </div>
            </div>` : ''}
            ${showToolbar ? `
            <form class="section-toolbar" id="departmentSearchForm">
                <div class="toolbar-group">
                    ${buildSearchControl('departmentSearch', state.filters.departments.search, 'Search departments, contacts, or locations')}
                </div>
            </form>` : ''}
            ${showForm ? `<form id="departmentForm" class="crud-form">
                <div class="form-header">
                    <h3>${currentRecord ? 'Edit Department' : 'Add Department'}</h3>
                    ${currentRecord ? '<button type="button" class="ghost-btn" id="departmentCancelEdit">Cancel Edit</button>' : ''}
                </div>
                ${renderFieldErrors(formErrors)}
                <div class="form-grid">
                    <label class="field">
                        <span>Department Name</span>
                        <input type="text" id="departmentName" value="${escapeHtml(currentRecord?.dept_name || '')}" required>
                    </label>
                    <label class="field">
                        <span>Head / HOD Name</span>
                        <input type="text" id="departmentHead" value="${escapeHtml(currentRecord?.head_name || '')}">
                    </label>
                    <label class="field">
                        <span>Contact Number</span>
                        <input type="text" id="departmentPhone" value="${escapeHtml(currentRecord?.contact_number || '')}">
                    </label>
                    <label class="field">
                        <span>Email</span>
                        <input type="email" id="departmentEmail" value="${escapeHtml(currentRecord?.email || '')}">
                    </label>
                    <label class="field">
                        <span>Block / Location</span>
                        <input type="text" id="departmentBlock" value="${escapeHtml(currentRecord?.block_location || '')}">
                    </label>
                    <label class="field">
                        <span>Room Number</span>
                        <input type="text" id="departmentRoom" value="${escapeHtml(currentRecord?.room_number || '')}">
                    </label>
                    <label class="field full-width">
                        <span>Office Hours</span>
                        <input type="text" id="departmentHours" value="${escapeHtml(currentRecord?.office_hours || '')}" placeholder="Monday-Friday 9AM-4PM">
                    </label>
                </div>
                <div class="form-actions">
                    <button type="submit" class="primary-btn">${currentRecord ? 'Save Changes' : 'Add Department'}</button>
                </div>
            </form>` : ''}
            ${mode === 'home' ? '' : showList ? `<div class="admin-list">
                ${filteredItems.length === 0 ? '<div class="empty-state">No departments match the current search.</div>' : filteredItems.map(item => `
                    <div class="record-card">
                        <div class="record-main">
                            <div class="record-topline">
                                <h3>${escapeHtml(item.dept_name)}</h3>
                            </div>
                            <div class="record-flags">
                                <span class="status-badge ${item.is_active ? 'active' : 'inactive'}">
                                    ${item.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <p><strong>Head:</strong> ${escapeHtml(item.head_name || 'Not set')}</p>
                            <p><strong>Contact:</strong> ${escapeHtml(item.contact_number || 'Not set')}</p>
                            <p><strong>Email:</strong> ${escapeHtml(item.email || 'Not set')}</p>
                            <p><strong>Location:</strong> ${escapeHtml([item.block_location, item.room_number].filter(Boolean).join(', ') || 'Not set')}</p>
                            <p><strong>Office Hours:</strong> ${escapeHtml(item.office_hours || 'Not set')}</p>
                        </div>
                        ${mode === 'edit' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-department-edit="${item.department_id}">Edit</button>
                        </div>` : mode === 'deactivate' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-department-toggle="${item.department_id}" data-current-status="${item.is_active}">
                                <i class="fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${item.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button type="button" class="danger-btn" data-department-delete="${item.department_id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>` : ''}
                    </div>
                `).join('')}
            </div>` : '<div class="empty-state">Choose an action above to continue.</div>'}
        </div>
    `;

    attachCrudModeHandlers(section, 'departments', renderDepartmentsSection);

    if (notice) {
        section.querySelector('#dismissDepartmentNotice').addEventListener('click', () => {
            state.notices.departments = null;
            renderDepartmentsSection();
        });
    }

    if (showToolbar) {
        section.querySelector('#departmentSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            state.filters.departments.search = section.querySelector('#departmentSearch').value.trim();
            renderDepartmentsSection();
        });
    }

    if (showForm && currentRecord) {
        section.querySelector('#departmentCancelEdit').addEventListener('click', () => {
            state.editing.departments = null;
            renderDepartmentsSection();
        });
    }

    if (showForm) {
        section.querySelector('#departmentForm').addEventListener('submit', handleDepartmentSubmit);
    }

    if (mode === 'edit') {
        section.querySelectorAll('[data-department-edit]').forEach(button => {
            button.addEventListener('click', () => {
                state.editing.departments = Number(button.dataset.departmentEdit);
                renderDepartmentsSection();
            });
        });
    }

    if (mode === 'deactivate') {
        section.querySelectorAll('[data-department-delete]').forEach(button => {
            button.addEventListener('click', () => handleDepartmentDelete(Number(button.dataset.departmentDelete)));
        });
        section.querySelectorAll('[data-department-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const id = Number(button.dataset.departmentToggle);
                const currentStatus = String(button.dataset.currentStatus) === 'true' || button.dataset.currentStatus === '1';
                handleDepartmentToggleStatus(id, !currentStatus);
            });
        });
    }
}

async function handleDepartmentToggleStatus(deptId, nextStatus) {
    try {
        await apiRequest(`/departments/${deptId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: nextStatus })
        });
        await loadDepartmentsAndPrograms();
        renderDepartmentsSection();
    } catch (error) {
        renderDepartmentsSection(error.details, error.message);
    }
}

async function handleDepartmentSubmit(event) {
    event.preventDefault();
    const isEditMode = Boolean(state.editing.departments);
    const payload = {
        dept_name: document.getElementById('departmentName').value.trim(),
        head_name: document.getElementById('departmentHead').value.trim(),
        contact_number: document.getElementById('departmentPhone').value.trim(),
        email: document.getElementById('departmentEmail').value.trim(),
        block_location: document.getElementById('departmentBlock').value.trim(),
        room_number: document.getElementById('departmentRoom').value.trim(),
        office_hours: document.getElementById('departmentHours').value.trim(),
        is_active: true // Default for new, could be extended if form had a checkbox
    };

    try {
        if (isEditMode) {
            await apiRequest(`/departments/${state.editing.departments}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        } else {
            await apiRequest('/departments', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }

        state.editing.departments = null;
        state.notices.departments = buildDepartmentFollowUpNotice(payload, isEditMode ? 'update' : 'create');
        state.modes.departments = 'home';
        await loadDepartmentsAndPrograms();
        renderDepartmentsSection();
        renderProgramsSection();
    } catch (error) {
        renderDepartmentsSection(error.details, error.message);
    }
}

async function handleDepartmentDelete(departmentId) {
    const record = state.departments.find(item => item.department_id === departmentId);
    if (!record) return;
    if (!await CustomModal.confirm('Delete Department', `Delete the department "${record.dept_name}"? This only works if no program is linked to it.`, { type: 'danger' })) return;

    try {
        await apiRequest(`/departments/${departmentId}`, { method: 'DELETE' });
        if (state.editing.departments === departmentId) state.editing.departments = null;
        await loadDepartmentsAndPrograms();
        renderDepartmentsSection();
        renderProgramsSection();
    } catch (error) {
        renderDepartmentsSection({}, error.message);
    }
}

function getFilteredPrograms() {
    const { search, status, department } = state.filters.programs;
    return state.programs.filter(item => {
        const matchesSearch = !search || [item.program_name, item.program_level, item.dept_name, item.description]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesStatus = status === 'all' || (status === 'active' ? item.is_active : !item.is_active);
        const matchesDepartment = department === 'all' || String(item.department_id) === department;
        return matchesSearch && matchesStatus && matchesDepartment;
    });
}

function renderProgramsSection(formErrors = {}, globalError = '') {
    const section = document.getElementById('programs');
    const editingId = state.editing.programs;
    const currentRecord = editingId ? state.programs.find(item => item.program_id === editingId) : null;
    const filteredItems = getFilteredPrograms();
    const mode = state.modes.programs;
    const showToolbar = mode === 'browse';
    const showForm = mode === 'add' || (mode === 'edit' && currentRecord);
    const showList = ['browse', 'edit', 'deactivate'].includes(mode);
    const notice = state.notices.programs;

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>Programs</h2>
                    <p>Manage department-linked academic programs with safe validation and soft deactivation.</p>
                </div>
                <div class="section-meta">
                    <span>${state.programs.length} programs</span>
                </div>
            </div>
            ${globalError ? `<div class="error-banner">${escapeHtml(globalError)}</div>` : ''}
            ${renderCrudModeChooser('programs', {
        homeText: 'Choose one program-management task first, and we will open only that workspace.',
        browseTitle: 'Browse Records',
        browseText: 'Review the program catalog and narrow it down with search and filters in one place.',
        addText: 'Open only the add-program form.',
        editText: 'Pick a program to edit, then its form appears separately.',
        deactivateText: 'Open only the deactivation actions for programs.'
    })}
            ${notice ? `
            <div class="followup-notice">
                <div class="followup-notice__header">
                    <div>
                        <h3>${escapeHtml(notice.title)}</h3>
                        <p>${escapeHtml(notice.intro)}</p>
                    </div>
                    <button type="button" class="ghost-btn" id="dismissProgramNotice">Dismiss</button>
                </div>
                <div class="followup-grid">
                    <div class="followup-card">
                        <h4>Admin Should Review</h4>
                        <ul>
                            ${notice.adminTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="followup-card followup-card--soft">
                        <h4>Developer Awareness</h4>
                        <ul>
                            ${notice.developerTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>` : ''}
            ${showToolbar ? `
            <form class="section-toolbar" id="programSearchForm">
                <div class="toolbar-group">
                    ${buildSearchControl('programSearch', state.filters.programs.search, 'Search by program, level, or department')}
                    <label>
                        <span>Status</span>
                        <select id="programStatusFilter">
                            <option value="all" ${state.filters.programs.status === 'all' ? 'selected' : ''}>All</option>
                            <option value="active" ${state.filters.programs.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${state.filters.programs.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </label>
                    <label>
                        <span>Department</span>
                        <select id="programDepartmentFilter">
                            <option value="all">All Departments</option>
                            ${state.meta.departments.map(department => `
                                <option value="${department.department_id}" ${state.filters.programs.department === String(department.department_id) ? 'selected' : ''}>
                                    ${escapeHtml(department.dept_name)}
                                </option>
                            `).join('')}
                        </select>
                    </label>
                </div>
            </form>` : ''}
            ${showForm ? `<form id="programForm" class="crud-form">
                <div class="form-header">
                    <h3>${currentRecord ? 'Edit Program' : 'Add Program'}</h3>
                    ${currentRecord ? '<button type="button" class="ghost-btn" id="programCancelEdit">Cancel Edit</button>' : ''}
                </div>
                ${renderFieldErrors(formErrors)}
                <div class="form-grid">
                    <label class="field">
                        <span>Department</span>
                        <select id="programDepartment" required>
                            <option value="">Select department</option>
                            ${state.meta.departments.map(department => `
                                <option value="${department.department_id}" ${(currentRecord?.department_id || '') === department.department_id ? 'selected' : ''}>
                                    ${escapeHtml(department.dept_name)}
                                </option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="field">
                        <span>Program Name</span>
                        <input type="text" id="programName" value="${escapeHtml(currentRecord?.program_name || '')}" required>
                    </label>
                    <label class="field">
                        <span>Program Level</span>
                        <input type="text" id="programLevel" value="${escapeHtml(currentRecord?.program_level || '')}" placeholder="BS, MS, MPhil" required>
                    </label>
                    <label class="field">
                        <span>Duration (Years)</span>
                        <input type="number" step="0.1" min="0.5" id="programDuration" value="${escapeHtml(currentRecord?.duration_years || '')}" required>
                    </label>
                    <label class="field">
                        <span>Total Semesters</span>
                        <input type="number" min="1" id="programSemesters" value="${escapeHtml(currentRecord?.total_semesters || '')}" required>
                    </label>
                    <label class="field">
                        <span>Total Credit Hours</span>
                        <input type="number" min="1" id="programCredits" value="${escapeHtml(currentRecord?.total_credit_hrs || '')}" required>
                    </label>
                    <label class="field">
                        <span>Total Seats</span>
                        <input type="number" min="1" id="programSeats" value="${escapeHtml(currentRecord?.total_seats || '')}" required>
                    </label>
                    <label class="field inline-field">
                        <span>Active</span>
                        <input type="checkbox" id="programIsActive" ${currentRecord ? (currentRecord.is_active ? 'checked' : '') : 'checked'}>
                    </label>
                    <label class="field full-width">
                        <span>Description</span>
                        <textarea id="programDescription" rows="4" placeholder="Short program overview for admin reference and downstream chatbot use.">${escapeHtml(currentRecord?.description || '')}</textarea>
                    </label>
                </div>
                <div class="form-actions">
                    <button type="submit" class="primary-btn">${currentRecord ? 'Save Changes' : 'Add Program'}</button>
                </div>
            </form>` : ''}
            ${mode === 'home' ? '' : showList ? `<div class="admin-list">
                ${filteredItems.length === 0 ? '<div class="empty-state">No programs match the current filters.</div>' : filteredItems.map(item => `
                    <div class="record-card">
                        <div class="record-main">
                            <div class="record-topline">
                                <h3>${escapeHtml(item.program_name)}</h3>
                                ${activeBadge(item.is_active)}
                            </div>
                            <p><strong>Department:</strong> ${escapeHtml(item.dept_name)}</p>
                            <p><strong>Level:</strong> ${escapeHtml(item.program_level)} | <strong>Duration:</strong> ${escapeHtml(item.duration_years)} years</p>
                            <p><strong>Semesters:</strong> ${escapeHtml(item.total_semesters)} | <strong>Credit Hours:</strong> ${escapeHtml(item.total_credit_hrs)} | <strong>Seats:</strong> ${escapeHtml(item.total_seats)}</p>
                            <p class="record-text">${escapeHtml(item.description || 'No description added.')}</p>
                        </div>
                        ${mode === 'edit' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-program-edit="${item.program_id}">Edit</button>
                        </div>` : mode === 'deactivate' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-program-toggle="${item.program_id}" data-current-status="${item.is_active}">
                                <i class="fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${item.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button type="button" class="danger-btn" data-program-delete="${item.program_id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>` : ''}
                    </div>
                `).join('')}
            </div>` : '<div class="empty-state">Choose an action above to continue.</div>'}
        </div>
    `;

    attachCrudModeHandlers(section, 'programs', renderProgramsSection);

    if (notice) {
        section.querySelector('#dismissProgramNotice').addEventListener('click', () => {
            state.notices.programs = null;
            renderProgramsSection();
        });
    }

    if (showToolbar) {
        section.querySelector('#programSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            state.filters.programs.search = section.querySelector('#programSearch').value.trim();
            renderProgramsSection();
        });
        section.querySelector('#programStatusFilter').addEventListener('change', event => {
            state.filters.programs.status = event.target.value;
            renderProgramsSection();
        });
        section.querySelector('#programDepartmentFilter').addEventListener('change', event => {
            state.filters.programs.department = event.target.value;
            renderProgramsSection();
        });
    }

    if (showForm && currentRecord) {
        section.querySelector('#programCancelEdit').addEventListener('click', () => {
            state.editing.programs = null;
            renderProgramsSection();
        });
    }

    if (showForm) {
        section.querySelector('#programForm').addEventListener('submit', handleProgramSubmit);
    }

    if (mode === 'edit') {
        section.querySelectorAll('[data-program-edit]').forEach(button => {
            button.addEventListener('click', () => {
                state.editing.programs = Number(button.dataset.programEdit);
                renderProgramsSection();
            });
        });
    }

    if (mode === 'deactivate') {
        section.querySelectorAll('[data-program-delete]').forEach(button => {
            button.addEventListener('click', () => handleProgramPermanentDelete(Number(button.dataset.programDelete)));
        });
        section.querySelectorAll('[data-program-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const id = Number(button.dataset.programToggle);
                const currentStatus = String(button.dataset.currentStatus) === 'true' || button.dataset.currentStatus === '1';
                handleProgramToggleStatus(id, !currentStatus);
            });
        });
    }
}

async function handleProgramToggleStatus(programId, nextStatus) {
    try {
        await apiRequest(`/programs/${programId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: nextStatus })
        });
        await loadPrograms();
        renderProgramsSection();
    } catch (error) {
        renderProgramsSection(error.details, error.message);
    }
}

async function handleProgramSubmit(event) {
    event.preventDefault();
    const isEditMode = Boolean(state.editing.programs);
    const payload = {
        department_id: Number(document.getElementById('programDepartment').value),
        program_name: document.getElementById('programName').value.trim(),
        program_level: document.getElementById('programLevel').value.trim(),
        duration_years: document.getElementById('programDuration').value.trim(),
        total_semesters: document.getElementById('programSemesters').value.trim(),
        total_credit_hrs: document.getElementById('programCredits').value.trim(),
        total_seats: document.getElementById('programSeats').value.trim(),
        description: document.getElementById('programDescription').value.trim(),
        is_active: document.getElementById('programIsActive').checked
    };

    try {
        if (isEditMode) {
            await apiRequest(`/programs/${state.editing.programs}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        } else {
            await apiRequest('/programs', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }

        state.editing.programs = null;
        state.notices.programs = buildProgramFollowUpNotice(payload, isEditMode ? 'update' : 'create');
        state.modes.programs = 'home';
        await loadPrograms();
        renderProgramsSection();
    } catch (error) {
        renderProgramsSection(error.details, error.message);
    }
}

async function handleProgramPermanentDelete(programId) {
    const record = state.programs.find(item => item.program_id === programId);
    if (!record) return;
    if (!await CustomModal.confirm('Delete Program', `Permanently DELETE the program "${record.program_name}"? This action cannot be undone and will fail if other records are linked.`, { type: 'danger' })) return;

    try {
        await apiRequest(`/programs/${programId}/permanent`, { method: 'DELETE' });
        if (state.editing.programs === programId) state.editing.programs = null;
        await loadPrograms();
        renderProgramsSection();
    } catch (error) {
        renderProgramsSection({}, error.message);
    }
}

function getFilteredEvents() {
    const { search, status, type, registration } = state.filters.events;
    return state.events.filter(item => {
        const matchesSearch = !search || [item.event_name, item.event_type_name, item.venue, item.description, item.semester_name]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesStatus = status === 'all' || (status === 'active' ? item.is_active : !item.is_active);
        const matchesType = type === 'all' || String(item.event_type_id) === type;
        const matchesRegistration = registration === 'all'
            || (registration === 'required' && item.registration_required)
            || (registration === 'not_required' && !item.registration_required);
        return matchesSearch && matchesStatus && matchesType && matchesRegistration;
    });
}

function getFilteredFeeStructures() {
    const { search, status, program, feeType } = state.filters.feeStructures;
    return state.feeStructures.filter(item => {
        const matchesSearch = !search || [item.program_name, item.fee_type_name, item.amount, item.effective_from, item.effective_to]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesStatus = status === 'all'
            || (status === 'active' && !item.effective_to)
            || (status === 'inactive' && !!item.effective_to);
        const matchesProgram = program === 'all' || String(item.program_id) === program;
        const matchesFeeType = feeType === 'all' || String(item.fee_type_id) === feeType;
        return matchesSearch && matchesStatus && matchesProgram && matchesFeeType;
    });
}

function renderFeeStructuresSection(formErrors = {}, globalError = '') {
    const section = document.getElementById('feeStructures');
    const editingId = state.editing.feeStructures;
    const currentRecord = editingId ? state.feeStructures.find(item => item.fee_structure_id === editingId) : null;
    const filteredItems = getFilteredFeeStructures();
    const mode = state.modes.feeStructures;
    const showToolbar = mode === 'browse';
    const showForm = mode === 'add' || (mode === 'edit' && currentRecord);
    const showList = ['browse', 'edit', 'deactivate'].includes(mode);
    const notice = state.notices.feeStructures;

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>Fee Structure</h2>
                    <p>Manage program fee components with effective dates and safe historical closure.</p>
                </div>
                <div class="section-meta">
                    <span>${state.feeStructures.length} fee records</span>
                </div>
            </div>
            ${globalError ? `<div class="error-banner">${escapeHtml(globalError)}</div>` : ''}
            ${renderCrudModeChooser('feeStructures', {
        homeText: 'Choose one fee-structure task and we will open only that workspace.',
        browseTitle: 'Browse Records',
        browseText: 'Review fee records with search and filters for program, fee type, and active status.',
        addText: 'Open only the add-fee-record form.',
        editText: 'Pick a fee record first, then its form appears separately.',
        deactivateText: 'Open only the safe deactivation actions for fee records.'
    })}
            ${notice ? `
            <div class="followup-notice">
                <div class="followup-notice__header">
                    <div>
                        <h3>${escapeHtml(notice.title)}</h3>
                        <p>${escapeHtml(notice.intro)}</p>
                    </div>
                    <button type="button" class="ghost-btn" id="dismissFeeStructureNotice">Dismiss</button>
                </div>
                <div class="followup-grid">
                    <div class="followup-card">
                        <h4>Admin Should Review</h4>
                        <ul>${notice.adminTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                    <div class="followup-card followup-card--soft">
                        <h4>Developer Awareness</h4>
                        <ul>${notice.developerTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                </div>
            </div>` : ''}
            ${showToolbar ? `
            <form class="section-toolbar" id="feeStructureSearchForm">
                <div class="toolbar-group">
                    ${buildSearchControl('feeStructureSearch', state.filters.feeStructures.search, 'Search by program, fee type, date, or amount')}
                    <label>
                        <span>Status</span>
                        <select id="feeStructureStatusFilter">
                            <option value="all" ${state.filters.feeStructures.status === 'all' ? 'selected' : ''}>All</option>
                            <option value="active" ${state.filters.feeStructures.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${state.filters.feeStructures.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </label>
                    <label>
                        <span>Program</span>
                        <select id="feeStructureProgramFilter">
                            <option value="all">All Programs</option>
                            ${state.meta.programs.map(program => `
                                <option value="${program.program_id}" ${state.filters.feeStructures.program === String(program.program_id) ? 'selected' : ''}>${escapeHtml(program.program_name)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label>
                        <span>Fee Type</span>
                        <select id="feeStructureTypeFilter">
                            <option value="all">All Fee Types</option>
                            ${state.meta.feeTypes.map(type => `
                                <option value="${type.fee_type_id}" ${state.filters.feeStructures.feeType === String(type.fee_type_id) ? 'selected' : ''}>${escapeHtml(type.fee_type_name)}</option>
                            `).join('')}
                        </select>
                    </label>
                </div>
            </form>` : ''}
            ${showForm ? `<form id="feeStructureForm" class="crud-form">
                <div class="form-header">
                    <h3>${currentRecord ? 'Edit Fee Record' : 'Add Fee Record'}</h3>
                    ${currentRecord ? '<button type="button" class="ghost-btn" id="feeStructureCancelEdit">Cancel Edit</button>' : ''}
                </div>
                ${renderFieldErrors(formErrors)}
                <div class="form-grid">
                    <label class="field">
                        <span>Program</span>
                        <select id="feeStructureProgram" required>
                            <option value="">Select program</option>
                            ${state.meta.programs.map(program => `
                                <option value="${program.program_id}" ${(currentRecord?.program_id || '') === program.program_id ? 'selected' : ''}>${escapeHtml(program.program_name)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="field">
                        <span>Fee Type</span>
                        <select id="feeStructureType" required>
                            <option value="">Select fee type</option>
                            ${state.meta.feeTypes.map(type => `
                                <option value="${type.fee_type_id}" ${(currentRecord?.fee_type_id || '') === type.fee_type_id ? 'selected' : ''}>${escapeHtml(type.fee_type_name)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="field">
                        <span>Amount</span>
                        <input type="number" min="0" step="0.01" id="feeStructureAmount" value="${escapeHtml(currentRecord?.amount || '')}" required>
                    </label>
                    <label class="field">
                        <span>Effective From</span>
                        <input type="date" id="feeStructureFrom" value="${escapeHtml(toInputDate(currentRecord?.effective_from))}" required>
                    </label>
                    <label class="field">
                        <span>Effective To</span>
                        <input type="date" id="feeStructureTo" value="${escapeHtml(toInputDate(currentRecord?.effective_to))}">
                    </label>
                </div>
                <div class="form-actions">
                    <button type="submit" class="primary-btn">${currentRecord ? 'Save Changes' : 'Add Fee Record'}</button>
                </div>
            </form>` : ''}
            ${mode === 'home' ? '' : showList ? `<div class="admin-list">
                ${filteredItems.length === 0 ? '<div class="empty-state">No fee structure records match the current filters.</div>' : filteredItems.map(item => `
                    <div class="record-card">
                        <div class="record-main">
                            <div class="record-topline">
                                <h3>${escapeHtml(item.program_name)} - ${escapeHtml(item.fee_type_name)}</h3>
                                ${activeBadge(!item.effective_to)}
                            </div>
                            <p><strong>Amount:</strong> Rs. ${Number(item.amount || 0).toLocaleString('en-PK')}</p>
                            <p><strong>Effective From:</strong> ${escapeHtml(formatDate(item.effective_from))}</p>
                            <p><strong>Effective To:</strong> ${escapeHtml(item.effective_to ? formatDate(item.effective_to) : 'Current / Open')}</p>
                        </div>
                        ${mode === 'edit' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-fee-edit="${item.fee_structure_id}">Edit</button>
                        </div>` : mode === 'deactivate' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-fee-toggle="${item.fee_structure_id}" data-current-status="${!item.effective_to}">
                                <i class="fas ${!item.effective_to ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${!item.effective_to ? 'Deactivate' : 'Activate'}
                            </button>
                            <button type="button" class="danger-btn" data-fee-delete="${item.fee_structure_id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>` : ''}
                    </div>
                `).join('')}
            </div>` : '<div class="empty-state">Choose an action above to continue.</div>'}
        </div>
    `;

    attachCrudModeHandlers(section, 'feeStructures', renderFeeStructuresSection);
    if (notice) {
        section.querySelector('#dismissFeeStructureNotice').addEventListener('click', () => {
            state.notices.feeStructures = null;
            renderFeeStructuresSection();
        });
    }
    if (showToolbar) {
        section.querySelector('#feeStructureSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            state.filters.feeStructures.search = section.querySelector('#feeStructureSearch').value.trim();
            renderFeeStructuresSection();
        });
        section.querySelector('#feeStructureStatusFilter').addEventListener('change', event => {
            state.filters.feeStructures.status = event.target.value;
            renderFeeStructuresSection();
        });
        section.querySelector('#feeStructureProgramFilter').addEventListener('change', event => {
            state.filters.feeStructures.program = event.target.value;
            renderFeeStructuresSection();
        });
        section.querySelector('#feeStructureTypeFilter').addEventListener('change', event => {
            state.filters.feeStructures.feeType = event.target.value;
            renderFeeStructuresSection();
        });
    }
    if (showForm && currentRecord) {
        section.querySelector('#feeStructureCancelEdit').addEventListener('click', () => {
            state.editing.feeStructures = null;
            renderFeeStructuresSection();
        });
    }
    if (showForm) section.querySelector('#feeStructureForm').addEventListener('submit', handleFeeStructureSubmit);
    if (mode === 'edit') {
        section.querySelectorAll('[data-fee-edit]').forEach(button => {
            button.addEventListener('click', () => {
                state.editing.feeStructures = Number(button.dataset.feeEdit);
                renderFeeStructuresSection();
            });
        });
    }
    if (mode === 'deactivate') {
        section.querySelectorAll('[data-fee-delete]').forEach(button => {
            button.addEventListener('click', () => handleFeeStructurePermanentDelete(Number(button.dataset.feeDelete)));
        });
        section.querySelectorAll('[data-fee-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const id = Number(button.dataset.feeToggle);
                const currentStatus = String(button.dataset.currentStatus) === 'true' || button.dataset.currentStatus === '1';
                handleFeeStructureToggleStatus(id, !currentStatus);
            });
        });
    }
}

async function handleFeeStructureToggleStatus(feeId, nextStatus) {
    try {
        await apiRequest(`/fee-structures/${feeId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: nextStatus })
        });
        await loadFeeStructures();
        renderFeeStructuresSection();
    } catch (error) {
        renderFeeStructuresSection(error.details, error.message);
    }
}

async function handleFeeStructureSubmit(event) {
    event.preventDefault();
    const isEditMode = Boolean(state.editing.feeStructures);
    const programSelect = document.getElementById('feeStructureProgram');
    const payload = {
        program_id: Number(programSelect.value),
        fee_type_id: Number(document.getElementById('feeStructureType').value),
        amount: document.getElementById('feeStructureAmount').value.trim(),
        effective_from: document.getElementById('feeStructureFrom').value,
        effective_to: document.getElementById('feeStructureTo').value || null,
        program_label: getSelectedText(programSelect, 'the selected program')
    };
    try {
        if (isEditMode) {
            await apiRequest(`/fee-structures/${state.editing.feeStructures}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiRequest('/fee-structures', { method: 'POST', body: JSON.stringify(payload) });
        }
        state.editing.feeStructures = null;
        state.notices.feeStructures = buildFeeStructureFollowUpNotice(payload, isEditMode ? 'update' : 'create');
        state.modes.feeStructures = 'home';
        await loadFeeStructures();
        renderFeeStructuresSection();
    } catch (error) {
        renderFeeStructuresSection(error.details, error.message);
    }
}

async function handleFeeStructurePermanentDelete(feeStructureId) {
    const record = state.feeStructures.find(item => item.fee_structure_id === feeStructureId);
    if (!record) return;
    if (!await CustomModal.confirm('Delete Fee Record', `Permanently DELETE the fee record for "${record.program_name} - ${record.fee_type_name}"? This action cannot be undone.`, { type: 'danger' })) return;

    try {
        await apiRequest(`/fee-structures/${feeStructureId}/permanent`, { method: 'DELETE' });
        if (state.editing.feeStructures === feeStructureId) state.editing.feeStructures = null;
        await loadFeeStructures();
        renderFeeStructuresSection();
    } catch (error) {
        renderFeeStructuresSection({}, error.message);
    }
}

function getFilteredScholarships() {
    const { search, status, semester, type } = state.filters.scholarships;
    return state.scholarships.filter(item => {
        const matchesSearch = !search || [item.type_name, item.funding_source, item.semester_name, item.year]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesStatus = status === 'all' || (status === 'active' ? item.is_active : !item.is_active);
        const matchesSemester = semester === 'all' || String(item.semester_id) === semester;
        const matchesType = type === 'all' || String(item.scholarship_type_id) === type;
        return matchesSearch && matchesStatus && matchesSemester && matchesType;
    });
}

function renderScholarshipsSection(formErrors = {}, globalError = '') {
    const section = document.getElementById('scholarships');
    const editingId = state.editing.scholarships;
    const currentRecord = editingId ? state.scholarships.find(item => item.scholarship_id === editingId) : null;
    const filteredItems = getFilteredScholarships();
    const mode = state.modes.scholarships;
    const showToolbar = mode === 'browse';
    const showForm = mode === 'add' || (mode === 'edit' && currentRecord);
    const showList = ['browse', 'edit', 'deactivate'].includes(mode);
    const notice = state.notices.scholarships;

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>Scholarships</h2>
                    <p>Manage scholarship cycles, deadlines, activation status, and beneficiary limits.</p>
                </div>
                <div class="section-meta">
                    <span>${state.scholarships.length} scholarship records</span>
                </div>
            </div>
            ${globalError ? `<div class="error-banner">${escapeHtml(globalError)}</div>` : ''}
            ${renderCrudModeChooser('scholarships', {
        homeText: 'Choose one scholarship-management task and we will open only that workspace.',
        browseTitle: 'Browse Records',
        browseText: 'Review scholarships with search and filters for semester, type, and active status.',
        addText: 'Open only the add-scholarship form.',
        editText: 'Pick a scholarship record first, then its form appears separately.',
        deactivateText: 'Open only the safe deactivation actions for scholarship records.'
    })}
            ${notice ? `
            <div class="followup-notice">
                <div class="followup-notice__header">
                    <div>
                        <h3>${escapeHtml(notice.title)}</h3>
                        <p>${escapeHtml(notice.intro)}</p>
                    </div>
                    <button type="button" class="ghost-btn" id="dismissScholarshipNotice">Dismiss</button>
                </div>
                <div class="followup-grid">
                    <div class="followup-card">
                        <h4>Admin Should Review</h4>
                        <ul>${notice.adminTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                    <div class="followup-card followup-card--soft">
                        <h4>Developer Awareness</h4>
                        <ul>${notice.developerTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                </div>
            </div>` : ''}
            ${showToolbar ? `
            <form class="section-toolbar" id="scholarshipSearchForm">
                <div class="toolbar-group">
                    ${buildSearchControl('scholarshipSearch', state.filters.scholarships.search, 'Search by scholarship type, funding source, or semester')}
                    <label>
                        <span>Status</span>
                        <select id="scholarshipStatusFilter">
                            <option value="all" ${state.filters.scholarships.status === 'all' ? 'selected' : ''}>All</option>
                            <option value="active" ${state.filters.scholarships.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${state.filters.scholarships.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </label>
                    <label>
                        <span>Semester</span>
                        <select id="scholarshipSemesterFilter">
                            <option value="all">All Semesters</option>
                            ${state.meta.semesters.map(semester => `
                                <option value="${semester.semester_id}" ${state.filters.scholarships.semester === String(semester.semester_id) ? 'selected' : ''}>${escapeHtml(semester.semester_name.includes(semester.year) ? semester.semester_name : `${semester.semester_name} ${semester.year}`)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label>
                        <span>Scholarship Type</span>
                        <select id="scholarshipTypeFilter">
                            <option value="all">All Types</option>
                            ${state.meta.scholarshipTypes.map(type => `
                                <option value="${type.scholarship_type_id}" ${state.filters.scholarships.type === String(type.scholarship_type_id) ? 'selected' : ''}>${escapeHtml(type.type_name)}</option>
                            `).join('')}
                        </select>
                    </label>
                </div>
            </form>` : ''}
            ${showForm ? `<form id="scholarshipForm" class="crud-form">
                <div class="form-header">
                    <h3>${currentRecord ? 'Edit Scholarship Record' : 'Add Scholarship Record'}</h3>
                    ${currentRecord ? '<button type="button" class="ghost-btn" id="scholarshipCancelEdit">Cancel Edit</button>' : ''}
                </div>
                ${renderFieldErrors(formErrors)}
                <div class="form-grid">
                    <label class="field">
                        <span>Scholarship Type</span>
                        <select id="scholarshipType" required>
                            <option value="">Select scholarship type</option>
                            ${state.meta.scholarshipTypes.map(type => `
                                <option value="${type.scholarship_type_id}" ${(currentRecord?.scholarship_type_id || '') === type.scholarship_type_id ? 'selected' : ''}>${escapeHtml(type.type_name)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="field">
                        <span>Semester</span>
                        <select id="scholarshipSemester" required>
                            <option value="">Select semester</option>
                            ${state.meta.semesters.map(semester => `
                                <option value="${semester.semester_id}" ${(currentRecord?.semester_id || '') === semester.semester_id ? 'selected' : ''}>${escapeHtml(`${semester.semester_name.includes(semester.year) ? semester.semester_name : `${semester.semester_name} ${semester.year}`} (${semester.semester_type})`)}</option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="field">
                        <span>Application Deadline</span>
                        <input type="date" id="scholarshipApplicationDeadline" value="${escapeHtml(toInputDate(currentRecord?.application_deadline))}" required>
                    </label>
                    <label class="field">
                        <span>Interview Date</span>
                        <input type="date" id="scholarshipInterviewDate" value="${escapeHtml(toInputDate(currentRecord?.interview_date))}">
                    </label>
                    <label class="field">
                        <span>Announcement Date</span>
                        <input type="date" id="scholarshipAnnouncementDate" value="${escapeHtml(toInputDate(currentRecord?.announcement_date))}">
                    </label>
                    <label class="field">
                        <span>Max Beneficiaries</span>
                        <input type="number" min="1" id="scholarshipMaxBeneficiaries" value="${escapeHtml(currentRecord?.max_beneficiaries || '')}">
                    </label>
                    <label class="field inline-field">
                        <span>Active</span>
                        <input type="checkbox" id="scholarshipIsActive" ${currentRecord ? (currentRecord.is_active ? 'checked' : '') : 'checked'}>
                    </label>
                </div>
                <div class="form-actions">
                    <button type="submit" class="primary-btn">${currentRecord ? 'Save Changes' : 'Add Scholarship Record'}</button>
                </div>
            </form>` : ''}
            ${mode === 'home' ? '' : showList ? `<div class="admin-list">
                ${filteredItems.length === 0 ? '<div class="empty-state">No scholarship records match the current filters.</div>' : filteredItems.map(item => `
                    <div class="record-card">
                        <div class="record-main">
                            <div class="record-topline">
                                <h3>${escapeHtml(item.type_name)}</h3>
                                ${activeBadge(item.is_active)}
                            </div>
                            <p><strong>Semester:</strong> ${escapeHtml(item.semester_name.includes(item.year) ? item.semester_name : `${item.semester_name} ${item.year}`)}</p>
                            <p><strong>Funding Source:</strong> ${escapeHtml(item.funding_source || 'Not listed')}</p>
                            <p><strong>Benefit:</strong> ${escapeHtml(item.benefit_percentage ?? 'Not listed')}% | <strong>Min CGPA:</strong> ${escapeHtml(item.min_cgpa_required ?? 'Not listed')}</p>
                            <p><strong>Deadline:</strong> ${escapeHtml(formatDate(item.application_deadline))}</p>
                            <p><strong>Interview:</strong> ${escapeHtml(item.interview_date ? formatDate(item.interview_date) : 'Not set')} | <strong>Announcement:</strong> ${escapeHtml(item.announcement_date ? formatDate(item.announcement_date) : 'Not set')}</p>
                            <p><strong>Max Beneficiaries:</strong> ${escapeHtml(item.max_beneficiaries ?? 'Not listed')} | <strong>Renewable:</strong> ${item.is_renewable ? 'Yes' : 'No'}</p>
                        </div>
                        ${mode === 'edit' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-scholarship-edit="${item.scholarship_id}">Edit</button>
                        </div>` : mode === 'deactivate' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-scholarship-toggle="${item.scholarship_id}" data-current-status="${item.is_active}">
                                <i class="fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${item.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button type="button" class="danger-btn" data-scholarship-delete="${item.scholarship_id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>` : ''}
                    </div>
                `).join('')}
            </div>` : '<div class="empty-state">Choose an action above to continue.</div>'}
        </div>
    `;

    attachCrudModeHandlers(section, 'scholarships', renderScholarshipsSection);
    if (notice) {
        section.querySelector('#dismissScholarshipNotice').addEventListener('click', () => {
            state.notices.scholarships = null;
            renderScholarshipsSection();
        });
    }
    if (showToolbar) {
        section.querySelector('#scholarshipSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            state.filters.scholarships.search = section.querySelector('#scholarshipSearch').value.trim();
            renderScholarshipsSection();
        });
        section.querySelector('#scholarshipStatusFilter').addEventListener('change', event => {
            state.filters.scholarships.status = event.target.value;
            renderScholarshipsSection();
        });
        section.querySelector('#scholarshipSemesterFilter').addEventListener('change', event => {
            state.filters.scholarships.semester = event.target.value;
            renderScholarshipsSection();
        });
        section.querySelector('#scholarshipTypeFilter').addEventListener('change', event => {
            state.filters.scholarships.type = event.target.value;
            renderScholarshipsSection();
        });
    }
    if (showForm && currentRecord) {
        section.querySelector('#scholarshipCancelEdit').addEventListener('click', () => {
            state.editing.scholarships = null;
            renderScholarshipsSection();
        });
    }
    if (showForm) section.querySelector('#scholarshipForm').addEventListener('submit', handleScholarshipSubmit);
    if (mode === 'edit') {
        section.querySelectorAll('[data-scholarship-edit]').forEach(button => {
            button.addEventListener('click', () => {
                state.editing.scholarships = Number(button.dataset.scholarshipEdit);
                renderScholarshipsSection();
            });
        });
    }
    if (mode === 'deactivate') {
        section.querySelectorAll('[data-scholarship-delete]').forEach(button => {
            button.addEventListener('click', () => handleScholarshipPermanentDelete(Number(button.dataset.scholarshipDelete)));
        });
        section.querySelectorAll('[data-scholarship-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const id = Number(button.dataset.scholarshipToggle);
                const currentStatus = String(button.dataset.currentStatus) === 'true' || button.dataset.currentStatus === '1';
                handleScholarshipToggleStatus(id, !currentStatus);
            });
        });
    }
}

async function handleScholarshipToggleStatus(scholarshipId, nextStatus) {
    try {
        await apiRequest(`/scholarships/${scholarshipId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: nextStatus })
        });
        await loadScholarships();
        renderScholarshipsSection();
    } catch (error) {
        renderScholarshipsSection(error.details, error.message);
    }
}

async function handleScholarshipSubmit(event) {
    event.preventDefault();
    const isEditMode = Boolean(state.editing.scholarships);
    const scholarshipTypeSelect = document.getElementById('scholarshipType');
    const payload = {
        scholarship_type_id: Number(scholarshipTypeSelect.value),
        semester_id: Number(document.getElementById('scholarshipSemester').value),
        application_deadline: document.getElementById('scholarshipApplicationDeadline').value,
        interview_date: document.getElementById('scholarshipInterviewDate').value || null,
        announcement_date: document.getElementById('scholarshipAnnouncementDate').value || null,
        max_beneficiaries: document.getElementById('scholarshipMaxBeneficiaries').value.trim(),
        is_active: document.getElementById('scholarshipIsActive').checked,
        scholarship_type_label: getSelectedText(scholarshipTypeSelect, 'the selected scholarship')
    };
    try {
        if (isEditMode) {
            await apiRequest(`/scholarships/${state.editing.scholarships}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiRequest('/scholarships', { method: 'POST', body: JSON.stringify(payload) });
        }
        state.editing.scholarships = null;
        state.notices.scholarships = buildScholarshipFollowUpNotice(payload, isEditMode ? 'update' : 'create');
        state.modes.scholarships = 'home';
        await loadScholarships();
        renderScholarshipsSection();
    } catch (error) {
        renderScholarshipsSection(error.details, error.message);
    }
}

async function handleScholarshipPermanentDelete(scholarshipId) {
    const record = state.scholarships.find(item => item.scholarship_id === scholarshipId);
    if (!record) return;
    if (!await CustomModal.confirm('Delete Scholarship Cycle', `Permanently DELETE the scholarship cycle for "${record.type_name}"? This action cannot be undone.`, { type: 'danger' })) return;

    try {
        await apiRequest(`/scholarships/${scholarshipId}/permanent`, { method: 'DELETE' });
        if (state.editing.scholarships === scholarshipId) state.editing.scholarships = null;
        await loadScholarships();
        renderScholarshipsSection();
    } catch (error) {
        renderScholarshipsSection({}, error.message);
    }
}

function renderEventsSection(formErrors = {}, globalError = '') {
    const section = document.getElementById('events');
    const editingId = state.editing.events;
    const currentRecord = editingId ? state.events.find(item => item.event_id === editingId) : null;
    const filteredItems = getFilteredEvents();
    const mode = state.modes.events;
    const showToolbar = mode === 'browse';
    const showForm = mode === 'add' || (mode === 'edit' && currentRecord);
    const showList = ['browse', 'edit', 'deactivate'].includes(mode);
    const notice = state.notices.events;

    section.innerHTML = `
        <div class="card section-card">
            <div class="section-header">
                <div>
                    <h2>Events</h2>
                    <p>Manage event records with safe date checks, semester dropdowns, and soft deactivation.</p>
                </div>
                <div class="section-meta">
                    <span>${state.events.length} events</span>
                </div>
            </div>
            ${globalError ? `<div class="error-banner">${escapeHtml(globalError)}</div>` : ''}
            ${renderCrudModeChooser('events', {
        homeText: 'Choose one event-management task and we will open only that workspace.',
        browseTitle: 'Browse Records',
        browseText: 'Browse events with search and filters for type, status, and registration in one workspace.',
        addText: 'Open only the add-event form.',
        editText: 'Pick an event first, then its edit form appears separately.',
        deactivateText: 'Open only the safe deactivation actions for events.'
    })}
            ${notice ? `
            <div class="followup-notice">
                <div class="followup-notice__header">
                    <div>
                        <h3>${escapeHtml(notice.title)}</h3>
                        <p>${escapeHtml(notice.intro)}</p>
                    </div>
                    <button type="button" class="ghost-btn" id="dismissEventNotice">Dismiss</button>
                </div>
                <div class="followup-grid">
                    <div class="followup-card">
                        <h4>Admin Should Review</h4>
                        <ul>${notice.adminTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                    <div class="followup-card followup-card--soft">
                        <h4>Developer Awareness</h4>
                        <ul>${notice.developerTasks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                </div>
            </div>` : ''}
            ${showToolbar ? `
            <form class="section-toolbar" id="eventSearchForm">
                <div class="toolbar-group">
                    ${buildSearchControl('eventSearch', state.filters.events.search, 'Search events, venue, or type')}
                    <label>
                        <span>Status</span>
                        <select id="eventStatusFilter">
                            <option value="all" ${state.filters.events.status === 'all' ? 'selected' : ''}>All</option>
                            <option value="active" ${state.filters.events.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${state.filters.events.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </label>
                    <label>
                        <span>Event Type</span>
                        <select id="eventTypeFilter">
                            <option value="all">All Types</option>
                            ${state.meta.eventTypes.map(type => `
                                <option value="${type.event_type_id}" ${state.filters.events.type === String(type.event_type_id) ? 'selected' : ''}>
                                    ${escapeHtml(type.type_name)}
                                </option>
                            `).join('')}
                        </select>
                    </label>
                    <label>
                        <span>Registration</span>
                        <select id="eventRegistrationFilter">
                            <option value="all" ${state.filters.events.registration === 'all' ? 'selected' : ''}>All</option>
                            <option value="required" ${state.filters.events.registration === 'required' ? 'selected' : ''}>Required</option>
                            <option value="not_required" ${state.filters.events.registration === 'not_required' ? 'selected' : ''}>Not Required</option>
                        </select>
                    </label>
                </div>
            </form>` : ''}
            ${showForm ? `<form id="eventForm" class="crud-form">
                <div class="form-header">
                    <h3>${currentRecord ? 'Edit Event' : 'Add Event'}</h3>
                    ${currentRecord ? '<button type="button" class="ghost-btn" id="eventCancelEdit">Cancel Edit</button>' : ''}
                </div>
                ${renderFieldErrors(formErrors)}
                <div class="form-grid">
                    <label class="field">
                        <span>Event Type</span>
                        <select id="eventType" required>
                            <option value="">Select event type</option>
                            ${state.meta.eventTypes.map(type => `
                                <option value="${type.event_type_id}" ${(currentRecord?.event_type_id || '') === type.event_type_id ? 'selected' : ''}>
                                    ${escapeHtml(type.type_name)}
                                </option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="field">
                        <span>Semester</span>
                        <select id="eventSemester">
                            <option value="">No semester linked</option>
                            ${state.meta.semesters.map(semester => `
                                <option value="${semester.semester_id}" ${(currentRecord?.semester_id || '') === semester.semester_id ? 'selected' : ''}>
                                    ${escapeHtml(`${semester.semester_name.includes(semester.year) ? semester.semester_name : `${semester.semester_name} ${semester.year}`} (${semester.semester_type})`)}
                                </option>
                            `).join('')}
                        </select>
                    </label>
                    <label class="field full-width">
                        <span>Event Name</span>
                        <input type="text" id="eventName" value="${escapeHtml(currentRecord?.event_name || '')}" required>
                    </label>
                    <label class="field">
                        <span>Start Date</span>
                        <input type="date" id="eventDate" value="${escapeHtml(toInputDate(currentRecord?.event_date))}" required>
                    </label>
                    <label class="field">
                        <span>End Date</span>
                        <input type="date" id="eventEndDate" value="${escapeHtml(toInputDate(currentRecord?.event_end_date))}">
                    </label>
                    <label class="field">
                        <span>Venue</span>
                        <input type="text" id="eventVenue" value="${escapeHtml(currentRecord?.venue || '')}">
                    </label>
                    <label class="field inline-field">
                        <span>Registration Required</span>
                        <input type="checkbox" id="eventRegistrationRequired" ${currentRecord?.registration_required ? 'checked' : ''}>
                    </label>
                    <label class="field inline-field">
                        <span>Active</span>
                        <input type="checkbox" id="eventIsActive" ${currentRecord ? (currentRecord.is_active ? 'checked' : '') : 'checked'}>
                    </label>
                    <label class="field">
                        <span>Registration Deadline</span>
                        <input type="date" id="eventRegistrationDeadline" value="${escapeHtml(toInputDate(currentRecord?.registration_deadline))}">
                    </label>
                    <label class="field full-width">
                        <span>Description</span>
                        <textarea id="eventDescription" rows="4" placeholder="Add event details, audience, or instructions.">${escapeHtml(currentRecord?.description || '')}</textarea>
                    </label>
                </div>
                <div class="form-actions">
                    <button type="submit" class="primary-btn">${currentRecord ? 'Save Changes' : 'Add Event'}</button>
                </div>
            </form>` : ''}
            ${mode === 'home' ? '' : showList ? `<div class="admin-list">
                ${filteredItems.length === 0 ? '<div class="empty-state">No events match the current filters.</div>' : filteredItems.map(item => `
                    <div class="record-card">
                        <div class="record-main">
                            <div class="record-topline">
                                <h3>${escapeHtml(item.event_name)}</h3>
                                ${activeBadge(item.is_active)}
                            </div>
                            <p><strong>Type:</strong> ${escapeHtml(item.event_type_name)} ${item.semester_name ? `| <strong>Semester:</strong> ${escapeHtml(item.semester_name)}` : ''}</p>
                            <p><strong>Date:</strong> ${escapeHtml(formatDate(item.event_date))}${item.event_end_date ? ` to ${escapeHtml(formatDate(item.event_end_date))}` : ''}</p>
                            <p><strong>Venue:</strong> ${escapeHtml(item.venue || 'Not set')}</p>
                            <p class="record-text">${escapeHtml(item.description || 'No description added.')}</p>
                            <div class="record-flags">
                                ${registrationBadge(item.registration_required)}
                                ${item.registration_required ? `<span class="status-badge warning">Deadline: ${escapeHtml(formatDate(item.registration_deadline))}</span>` : ''}
                            </div>
                        </div>
                        ${mode === 'edit' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-event-edit="${item.event_id}">Edit</button>
                        </div>` : mode === 'deactivate' ? `
                        <div class="record-actions">
                            <button type="button" class="secondary-btn" data-event-toggle="${item.event_id}" data-current-status="${item.is_active}">
                                <i class="fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${item.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button type="button" class="danger-btn" data-event-delete="${item.event_id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>` : ''}
                    </div>
                `).join('')}
            </div>` : '<div class="empty-state">Choose an action above to continue.</div>'}
        </div>
    `;

    attachCrudModeHandlers(section, 'events', renderEventsSection);

    if (notice) {
        section.querySelector('#dismissEventNotice').addEventListener('click', () => {
            state.notices.events = null;
            renderEventsSection();
        });
    }

    if (showToolbar) {
        section.querySelector('#eventSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            state.filters.events.search = section.querySelector('#eventSearch').value.trim();
            renderEventsSection();
        });
        section.querySelector('#eventStatusFilter').addEventListener('change', event => {
            state.filters.events.status = event.target.value;
            renderEventsSection();
        });
        section.querySelector('#eventTypeFilter').addEventListener('change', event => {
            state.filters.events.type = event.target.value;
            renderEventsSection();
        });
        section.querySelector('#eventRegistrationFilter').addEventListener('change', event => {
            state.filters.events.registration = event.target.value;
            renderEventsSection();
        });
    }

    if (showForm && currentRecord) {
        section.querySelector('#eventCancelEdit').addEventListener('click', () => {
            state.editing.events = null;
            renderEventsSection();
        });
    }

    if (showForm) {
        section.querySelector('#eventForm').addEventListener('submit', handleEventSubmit);
    }

    if (mode === 'edit') {
        section.querySelectorAll('[data-event-edit]').forEach(button => {
            button.addEventListener('click', () => {
                state.editing.events = Number(button.dataset.eventEdit);
                renderEventsSection();
            });
        });
    }

    if (mode === 'deactivate') {
        section.querySelectorAll('[data-event-delete]').forEach(button => {
            button.addEventListener('click', () => handleEventPermanentDelete(Number(button.dataset.eventDelete)));
        });
        section.querySelectorAll('[data-event-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const id = Number(button.dataset.eventToggle);
                const currentStatus = String(button.dataset.currentStatus) === 'true' || button.dataset.currentStatus === '1';
                handleEventToggleStatus(id, !currentStatus);
            });
        });
    }
}

async function handleEventToggleStatus(eventId, nextStatus) {
    try {
        await apiRequest(`/events/${eventId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: nextStatus })
        });
        await loadEvents();
        renderEventsSection();
    } catch (error) {
        renderEventsSection(error.details, error.message);
    }
}

async function handleEventSubmit(event) {
    event.preventDefault();
    const isEditMode = Boolean(state.editing.events);
    const payload = {
        event_type_id: Number(document.getElementById('eventType').value),
        semester_id: document.getElementById('eventSemester').value || null,
        event_name: document.getElementById('eventName').value.trim(),
        event_date: document.getElementById('eventDate').value,
        event_end_date: document.getElementById('eventEndDate').value || null,
        venue: document.getElementById('eventVenue').value.trim(),
        description: document.getElementById('eventDescription').value.trim(),
        registration_required: document.getElementById('eventRegistrationRequired').checked,
        registration_deadline: document.getElementById('eventRegistrationDeadline').value || null,
        is_active: document.getElementById('eventIsActive').checked
    };

    try {
        if (isEditMode) {
            await apiRequest(`/events/${state.editing.events}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        } else {
            await apiRequest('/events', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }

        state.editing.events = null;
        state.notices.events = buildEventFollowUpNotice(payload, isEditMode ? 'update' : 'create');
        state.modes.events = 'home';
        await loadEvents();
        renderEventsSection();
    } catch (error) {
        renderEventsSection(error.details, error.message);
    }
}

async function handleEventPermanentDelete(eventId) {
    const record = state.events.find(item => item.event_id === eventId);
    if (!record) return;
    if (!await CustomModal.confirm('Delete Event', `Permanently DELETE the event "${record.event_name}"? This action cannot be undone.`, { type: 'danger' })) return;

    try {
        await apiRequest(`/events/${eventId}/permanent`, { method: 'DELETE' });
        if (state.editing.events === eventId) state.editing.events = null;
        await loadEvents();
        renderEventsSection();
    } catch (error) {
        renderEventsSection({}, error.message);
    }
}

async function loadMeta() {
    state.meta = await apiRequest('/meta');
}

async function loadAuthUsers() {
    state.authUsersLoaded = false;
    state.authUsersError = null;

    try {
        state.authUsers = await apiRequest('/users');
        return true;
    } catch (error) {
        state.authUsers = [];
        state.authUsersError = error.message || 'Failed to load users.';
        return false;
    } finally {
        state.authUsersLoaded = true;
    }
}

async function loadSubscriptionAdminData() {
    state.subscriptionAdminLoaded = false;
    state.subscriptionAdminError = null;

    try {
        const [paymentsPayload, subscriptionsPayload] = await Promise.all([
            apiRequest('/manual-payments'),
            apiRequest('/subscriptions')
        ]);

        state.manualPayments = paymentsPayload.payments || [];
        state.adminSubscriptions = subscriptionsPayload.subscriptions || [];
        return true;
    } catch (error) {
        state.manualPayments = [];
        state.adminSubscriptions = [];
        state.subscriptionAdminError = error.message || 'Failed to load subscription data.';
        return false;
    } finally {
        state.subscriptionAdminLoaded = true;
    }
}

async function loadDepartmentsAndPrograms() {
    const [departments, programs] = await Promise.all([
        apiRequest('/departments'),
        apiRequest('/programs')
    ]);
    state.departments = departments;
    state.programs = programs;
    state.meta.departments = departments.map(item => ({
        department_id: item.department_id,
        dept_name: item.dept_name
    }));
}

async function loadPrograms() {
    state.programs = await apiRequest('/programs');
}

async function loadFeeStructures() {
    state.feeStructures = await apiRequest('/fee-structures');
}

async function loadScholarships() {
    state.scholarships = await apiRequest('/scholarships');
}

async function loadEvents() {
    state.events = await apiRequest('/events');
}

async function loadAdminData() {
    await loadMeta();
    await Promise.all([
        loadDepartmentsAndPrograms(),
        loadFeeStructures(),
        loadScholarships(),
        loadEvents(),
        loadFeedback()
    ]);
}

function renderAllSections() {
    renderUsersSection();
    renderSubscriptionsSection();
    renderFeedbackSection();
    renderDepartmentsSection();
    renderProgramsSection();
    renderFeeStructuresSection();
    renderScholarshipsSection();
    renderEventsSection();
}

async function initializeAdminDashboard() {
    attachNavigation();
    setSection(getSectionFromHash(), { updateHash: false });

    // Initial render with current state
    renderAllSections();

    try {
        // Load initial user and subscription data
        await Promise.all([
            loadAuthUsers(),
            loadSubscriptionAdminData()
        ]);

        // Refresh counts and render users/subs
        setOverviewCounts();
        renderUsersSection();
        renderSubscriptionsSection();

        // Load the rest of the administration data
        await loadAdminData();

        // Final full render
        renderAllSections();
    } catch (error) {
        console.error('Dashboard initialization error:', error);

        // Ensure everything is rendered at least in error/empty state
        renderAllSections();

        // Specific errors for major sections
        renderSectionError('users', 'Failed to load users.');
        renderSectionError('subscriptions', 'Failed to load subscriptions.');
        renderSectionError('feedback', error.message || 'Failed to load feedback.');
        renderSectionError('departments', error.message || 'Failed to load departments.');
        renderSectionError('programs', error.message || 'Failed to load programs.');
        renderSectionError('feeStructures', error.message || 'Failed to load fee structure records.');
        renderSectionError('scholarships', error.message || 'Failed to load scholarships.');
        renderSectionError('events', error.message || 'Failed to load events.');
    }
}

initializeAdminDashboard();
