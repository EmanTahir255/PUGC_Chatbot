function getChatbotShellUser() {
    let currentUser = null;

    try {
        currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch (error) {
        currentUser = null;
    }

    const email = currentUser?.email || localStorage.getItem('userEmail') || '';
    const storedRole = currentUser?.role || localStorage.getItem('userRole') || '';
    const role = storedRole || 'student';

    return {
        ...(currentUser || {}),
        email,
        role
    };
}

function renderChatbotNavLink(link) {
    const isSubs = link.id === 'subsBadgeLink';
    return `
        <a href="${link.href}" 
           ${link.id ? `id="${link.id}"` : ''} 
           ${link.active ? 'class="active"' : ''} 
           ${link.premiumOnly ? 'data-premium-only="true"' : ''} 
           title="${link.title || link.label}">
            <i class="fas ${link.icon}"></i>
            <span class="nav-label">${link.label}</span>
            ${isSubs ? '<span id="subsBadge" class="sidebar-badge" style="display:none;"></span>' : ''}
        </a>
    `;
}

function configureChatbotShell() {
    const user = getChatbotShellUser();
    const isAdmin = user.role === 'admin';
    const nav = document.querySelector('.sidebar-menu');

    document.body.dataset.userRole = user.role;
    document.body.classList.toggle('admin-chatbot-page', isAdmin);
    document.body.classList.toggle('student-chatbot-page', !isAdmin);

    if (nav) {
        const studentLinks = [
            { href: 'index.html', icon: 'fa-home', label: 'Home' },
            { href: 'dashboard.html', icon: 'fa-user', label: 'Student Dashboard' },
            { href: 'premium.html', icon: 'fa-crown', label: 'Premium' },
            { href: 'challan.html', icon: 'fa-file-invoice-dollar', label: 'Fee Challan', premiumOnly: true },
            { href: 'application-form.html', icon: 'fa-file-alt', label: 'Application Forms', premiumOnly: true },
            { href: 'chatbot.html', icon: 'fa-comments', label: 'Chatbot', active: true },
            { href: 'chatbot.html#history', id: 'history-btn', icon: 'fa-history', label: 'History' }
        ];

        const adminLinks = [
            { href: 'index.html', icon: 'fa-home', label: 'Home' },
            { href: 'admin-dashboard.html', icon: 'fa-chart-pie', label: 'Overview' },
            { href: 'admin-dashboard.html#users', icon: 'fa-users', label: 'Users' },
            { href: 'admin-dashboard.html#subscriptions', id: 'subsBadgeLink', icon: 'fa-credit-card', label: 'Subscriptions' },
            { href: 'admin-dashboard.html#departments', icon: 'fa-building', label: 'Departments' },
            { href: 'admin-dashboard.html#programs', icon: 'fa-graduation-cap', label: 'Programs' },
            { href: 'admin-dashboard.html#feeStructures', icon: 'fa-money-check-dollar', label: 'Fee Structure' },
            { href: 'admin-dashboard.html#scholarships', icon: 'fa-award', label: 'Scholarships' },
            { href: 'admin-dashboard.html#events', icon: 'fa-calendar-alt', label: 'Events' },
            { href: 'admin-dashboard.html#feedback', icon: 'fa-star', label: 'Feedback' },
            { href: 'report.html', icon: 'fa-chart-line', label: 'Analytics Report' },
            { href: 'chatbot.html', icon: 'fa-comments', label: 'Test Chatbot', active: true },
            { href: 'chatbot.html#history', id: 'history-btn', icon: 'fa-history', label: 'History' }
        ];

        nav.setAttribute('aria-label', isAdmin ? 'Admin navigation' : 'Student navigation');
        nav.innerHTML = `<div class="menu-links">${(isAdmin ? adminLinks : studentLinks).map(renderChatbotNavLink).join('')}</div>`;
    }

    if (isAdmin) {
        const kicker = document.querySelector('.chatbot-kicker');
        const heading = document.querySelector('.chatbot-card h2');
        const statusBadge = document.querySelector('[data-subscription-status]');

        if (kicker) kicker.textContent = 'Admin preview';
        if (heading) heading.textContent = 'Test PUGC SmartBot';
        if (statusBadge) {
            statusBadge.removeAttribute('data-subscription-status');
            statusBadge.textContent = 'Admin mode';
            statusBadge.classList.add('admin');
        }

        document.querySelectorAll('.tool-upgrade-link').forEach(link => link.remove());
        
        if (window.updateAdminBadgeCount) {
            window.updateAdminBadgeCount();
        }
    }
}

document.addEventListener('DOMContentLoaded', configureChatbotShell);
