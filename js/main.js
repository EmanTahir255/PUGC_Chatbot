async function loadLayout() {
    try {
        // Load header
        const headerRes = await fetch('components/header.html');
        const headerHtml = await headerRes.text();
        document.getElementById('header-placeholder').innerHTML = headerHtml;

        // Load footer
        const footerRes = await fetch('components/footer.html');
        const footerHtml = await footerRes.text();
        document.getElementById('footer-placeholder').innerHTML = footerHtml;

        // Toggle navbar buttons after header loads
        toggleNavbarButtons();
        initNavToggle();
    } catch (error) {
        console.error("Error loading layout components:", error);
    }
}

function toggleNavbarButtons() {
    const loggedIn = sessionStorage.getItem('isLoggedIn') === 'true' || localStorage.getItem('isLoggedIn') === 'true';
    const role = localStorage.getItem('userRole') || '';
    let user = {};

    try {
        user = JSON.parse(localStorage.getItem('currentUser') || '{}') || {};
    } catch (error) {
        user = {};
    }

    const isAdmin = role === 'admin';

    const signinBtn = document.querySelector('.btn-login.signin');
    const signupBtn = document.querySelector('.btn-login.signup'); // Sign Up button
    const logoutBtn = document.querySelector('.btn-login.btn-logout');
    const studentBtn = document.querySelector('.student-dashboard');
    const adminBtn = document.querySelector('.admin-dashboard');

    // Show/hide Sign In (only for guests)
    if (signinBtn) {
        signinBtn.style.display = loggedIn ? 'none' : 'flex';
    }

    // Show/hide Sign Up (only for guests)
    if (signupBtn) {
        signupBtn.style.display = loggedIn ? 'none' : 'flex';
    }

    // Show/hide Logout (only for logged-in users)
    if (logoutBtn) {
        logoutBtn.style.display = loggedIn ? 'flex' : 'none';

        // Attach logout functionality once
        if (!logoutBtn.dataset.initialized) {
            logoutBtn.dataset.initialized = 'true';
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (window.AuthService?.logout) {
                    await window.AuthService.logout();
                    return;
                }

                sessionStorage.clear();
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('userRole');
                localStorage.removeItem('currentUser');
                toggleNavbarButtons();
                window.location.href = 'login.html';
            });
        }
    }

    // Show/hide Student Dashboard (student users only)
    if (studentBtn) studentBtn.style.display = (loggedIn && !isAdmin) ? 'flex' : 'none';

    // Show/hide Admin Dashboard (only admin users)
    if (adminBtn) {
        adminBtn.style.display = (loggedIn && isAdmin) ? 'flex' : 'none';
    }
}

function initNavToggle() {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('nav-active');
            
            // Change icon
            const icon = navToggle.querySelector('i');
            if (icon) {
                if (navLinks.classList.contains('nav-active')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('nav-active');
                const icon = navToggle.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        });
    }
}

function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', () => {
            const input = icon.parentElement.querySelector('input');
            if (!input) return;

            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        });
    });
}

// Run layout
loadLayout();
initPasswordToggles();
window.toggleNavbarButtons = toggleNavbarButtons;
document.addEventListener('auth:changed', toggleNavbarButtons);
document.addEventListener('auth:cleared', toggleNavbarButtons);
