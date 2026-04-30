function getSidebarUser() {
    let currentUser = null;

    try {
        currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch (error) {
        currentUser = null;
    }

    const role = currentUser?.role || localStorage.getItem('userRole') || 'student';
    const email = currentUser?.email || localStorage.getItem('userEmail') || '';
    const fallbackName = role === 'admin' ? 'Admin' : 'Student';
    const emailName = email ? email.split('@')[0] : '';
    const name = currentUser?.name || emailName || fallbackName;

    return {
        ...currentUser,
        name,
        email,
        role
    };
}

function getInitials(name, email) {
    const source = (name || email || 'User').trim();
    const words = source.split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
}

function updateSidebarProfile() {
    const user = getSidebarUser();
    const initials = getInitials(user.name, user.email);

    document.querySelectorAll('[data-profile-name]').forEach(element => {
        element.textContent = user.name;
    });

    document.querySelectorAll('[data-profile-email]').forEach(element => {
        element.textContent = user.email || user.role;
    });

    document.querySelectorAll('[data-profile-initials]').forEach(element => {
        element.textContent = initials;
    });
}

function saveSidebarProfile(displayName) {
    const currentUser = getSidebarUser();
    const nextName = displayName.trim() || currentUser.name;
    const updatedUser = {
        ...currentUser,
        name: nextName
    };

    localStorage.setItem('currentUser', JSON.stringify(updatedUser));

    if (updatedUser.email) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const index = users.findIndex(user => user.email === updatedUser.email);

        if (index >= 0) {
            users[index] = {
                ...users[index],
                name: nextName
            };
            localStorage.setItem('users', JSON.stringify(users));
        }
    }

    updateSidebarProfile();
}

function performSidebarLogout() {
    sessionStorage.clear();
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

function ensureProfileModal() {
    let modal = document.getElementById('sidebar-profile-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'sidebar-profile-modal';
    modal.className = 'profile-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="profile-modal-card" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
            <div class="profile-modal-header">
                <h2 id="profile-modal-title">Profile</h2>
                <button type="button" class="profile-modal-close" aria-label="Close profile">x</button>
            </div>
            <div class="profile-modal-avatar" data-profile-initials>US</div>
            <label class="profile-field">
                <span>Display name</span>
                <input type="text" id="profile-display-name">
            </label>
            <label class="profile-field">
                <span>Email</span>
                <input type="text" id="profile-email" readonly>
            </label>
            <div class="profile-modal-actions">
                <button type="button" class="secondary-btn" data-profile-cancel>Cancel</button>
                <button type="button" class="primary-btn" data-profile-save>Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.profile-modal-close').addEventListener('click', closeProfileModal);
    modal.querySelector('[data-profile-cancel]').addEventListener('click', closeProfileModal);
    modal.querySelector('[data-profile-save]').addEventListener('click', () => {
        const input = modal.querySelector('#profile-display-name');
        saveSidebarProfile(input.value);
        closeProfileModal();
    });

    modal.addEventListener('click', event => {
        if (event.target === modal) closeProfileModal();
    });

    return modal;
}

function openProfileModal() {
    const user = getSidebarUser();
    const modal = ensureProfileModal();

    modal.querySelector('#profile-display-name').value = user.name;
    modal.querySelector('#profile-email').value = user.email || user.role;
    modal.querySelector('[data-profile-initials]').textContent = getInitials(user.name, user.email);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('#profile-display-name').focus();
}

function closeProfileModal() {
    const modal = document.getElementById('sidebar-profile-modal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function initSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const toggle = document.querySelector('.sidebar-toggle');
    const profileButton = document.querySelector('.sidebar-profile-button');
    const profileMenu = document.querySelector('.sidebar-profile-menu');
    const savedCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    document.body.classList.toggle('sidebar-collapsed', savedCollapsed);
    toggle?.setAttribute('aria-expanded', String(!savedCollapsed));
    updateSidebarProfile();

    toggle?.addEventListener('click', () => {
        const collapsed = !document.body.classList.contains('sidebar-collapsed');
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        localStorage.setItem('sidebarCollapsed', String(collapsed));
        toggle.setAttribute('aria-expanded', String(!collapsed));
        profileMenu?.classList.remove('active');
    });

    profileButton?.addEventListener('click', event => {
        event.stopPropagation();
        profileMenu?.classList.toggle('active');
    });

    document.querySelectorAll('[data-profile-action]').forEach(button => {
        button.addEventListener('click', () => {
            profileMenu?.classList.remove('active');

            if (button.dataset.profileAction === 'profile') {
                openProfileModal();
            }

            if (button.dataset.profileAction === 'logout') {
                performSidebarLogout();
            }
        });
    });

    document.addEventListener('click', event => {
        if (!profileMenu || !profileButton) return;
        if (profileMenu.contains(event.target) || profileButton.contains(event.target)) return;
        profileMenu.classList.remove('active');
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            profileMenu?.classList.remove('active');
            closeProfileModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', initSidebar);
