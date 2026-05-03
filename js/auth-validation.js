const AUTH_API_BASE = 'http://localhost:3000/api/auth';
const AUTH_TOKEN_KEY = 'authToken';

function showError(input, message) {
    let error = input.parentElement.querySelector('.error-msg');

    if (!error) {
        error = document.createElement('small');
        error.className = 'error-msg';
        input.parentElement.appendChild(error);
    }

    error.innerText = message;
    input.classList.add('error');
}

function clearError(input) {
    const error = input.parentElement.querySelector('.error-msg');
    if (error) error.remove();
    input.classList.remove('error');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getPasswordValidationError(password) {
    if (password.length < 8) {
        return 'Password must be at least 8 characters';
    }

    if (!/\d/.test(password)) {
        return 'Password must contain at least 1 number';
    }

    if (!/^[A-Za-z0-9!@#$%^&*]+$/.test(password)) {
        return 'Password can only use letters, numbers, and these special characters: ! @ # $ % ^ & *';
    }

    return '';
}

function readJSON(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (error) {
        return fallback;
    }
}

function getStoredToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function getStoredCurrentUser() {
    return readJSON('currentUser', null);
}

function getEmailFallbackName(email, role) {
    if (email) return email.split('@')[0];
    return role === 'admin' ? 'Admin' : 'Student';
}

function buildClientUser(serverUser = {}) {
    const existingUser = getStoredCurrentUser() || {};
    const users = readJSON('users', []);
    const email = String(serverUser.email || existingUser.email || '').trim().toLowerCase();
    const savedUser = users.find(user => String(user.email || '').trim().toLowerCase() === email) || {};
    const role = serverUser.role || existingUser.role || savedUser.role || 'student';
    const fullName = serverUser.fullName || serverUser.name || existingUser.fullName || existingUser.name || savedUser.fullName || savedUser.name || getEmailFallbackName(email, role);
    const features = Array.isArray(serverUser.features)
        ? serverUser.features
        : Array.isArray(existingUser.features)
            ? existingUser.features
            : Array.isArray(savedUser.features)
                ? savedUser.features
                : [];
    const subscription = serverUser.subscription || existingUser.subscription || savedUser.subscription || { status: 'free' };

    return {
        ...savedUser,
        ...existingUser,
        ...serverUser,
        userId: serverUser.userId || existingUser.userId || savedUser.userId || null,
        name: fullName,
        fullName,
        email,
        role,
        features,
        subscription
    };
}

function syncUserList(user) {
    if (!user?.email) return;

    const users = readJSON('users', []);
    const index = users.findIndex(item => String(item.email || '').trim().toLowerCase() === user.email);

    if (index >= 0) {
        users[index] = {
            ...users[index],
            ...user
        };
    } else {
        users.push(user);
    }

    localStorage.setItem('users', JSON.stringify(users));
}

function updateLegacyAuthFlags(user) {
    localStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', user.email || '');
    localStorage.setItem('userRole', user.role || 'student');
    localStorage.setItem('currentUser', JSON.stringify(user));
    syncUserList(user);
}

function dispatchAuthEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
    if (typeof window.toggleNavbarButtons === 'function') {
        window.toggleNavbarButtons();
    }
}

function applyAuthState(payload = {}) {
    const token = payload.token || getStoredToken();
    const user = buildClientUser(payload.user || {});

    if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    }

    updateLegacyAuthFlags(user);
    dispatchAuthEvent('auth:changed', { user });
    return user;
}

function clearAuthState() {
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('currentUser');
    dispatchAuthEvent('auth:cleared');
}

function isUserLoggedIn() {
    return Boolean(getStoredToken() && getStoredCurrentUser()?.email);
}

function getStoredUserRole() {
    const currentUser = getStoredCurrentUser();
    return currentUser?.role || localStorage.getItem('userRole') || '';
}

async function requestAuth(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    const token = getStoredToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${AUTH_API_BASE}${path}`, {
        ...options,
        headers
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok) {
        const error = new Error(payload.error || 'Request failed.');
        error.status = response.status;
        error.details = payload.details || {};
        throw error;
    }

    return payload;
}

function getAuthPageRedirect(role) {
    return role === 'admin' ? 'admin-dashboard.html' : 'dashboard.html';
}

function setFormStatus(form, message, type = 'error') {
    let element = form.querySelector('.form-status');

    if (!element) {
        element = document.createElement('p');
        element.className = 'form-status';
        element.style.marginTop = '14px';
        element.style.fontSize = '0.95rem';
        element.style.fontWeight = '600';
        const actionButton = form.querySelector('button[type="submit"]');
        if (actionButton) {
            actionButton.insertAdjacentElement('afterend', element);
        } else {
            form.appendChild(element);
        }
    }

    element.textContent = message;
    element.style.color = type === 'success' ? '#15803d' : '#b91c1c';
}

function clearFormStatus(form) {
    const element = form.querySelector('.form-status');
    if (element) element.remove();
}

function setButtonLoading(button, loadingText) {
    if (!button) return () => { };
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = loadingText;

    return () => {
        button.disabled = false;
        button.innerHTML = originalHtml;
    };
}

async function syncCurrentUserFromServer() {
    const token = getStoredToken();
    if (!token) return null;

    try {
        const payload = await requestAuth('/me');
        return applyAuthState({ token, user: payload.user });
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            clearAuthState();
            return null;
        }

        throw error;
    }
}

async function logoutAndRedirect() {
    try {
        if (getStoredToken()) {
            await requestAuth('/logout', { method: 'POST' });
        }
    } catch (error) {
        console.warn('Logout request failed:', error);
    } finally {
        clearAuthState();
        window.location.href = 'login.html';
    }
}


/* ------------------ Custom Modal Helper (Auth) ------------------ */
function escapeHtmlForModal(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class CustomAuthModal {
    static alert(title, message, options = {}) {
        const { buttonText = 'OK', type = 'warning' } = options;
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'custom-modal-backdrop';
            const icon = type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info';
            backdrop.innerHTML = `
                <div class="custom-modal-container">
                    <div class="modal-icon-wrapper ${type === 'danger' ? 'danger' : ''}">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <h3>${escapeHtmlForModal(title)}</h3>
                    <p>${escapeHtmlForModal(message)}</p>
                    <div class="modal-footer">
                        <button class="modal-btn confirm-btn" id="modalOkBtn">${escapeHtmlForModal(buttonText)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(backdrop);
            setTimeout(() => backdrop.classList.add('active'), 10);
            const cleanup = () => {
                backdrop.classList.remove('active');
                setTimeout(() => {
                    if (backdrop.parentNode) document.body.removeChild(backdrop);
                    resolve();
                }, 300);
            };
            backdrop.querySelector('#modalOkBtn').addEventListener('click', cleanup);
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
        });
    }
}

function bindProtectedLinks() {
    document.querySelectorAll('.protected').forEach(link => {
        const loggedIn = isUserLoggedIn();
        const showGuest = link.classList.contains('show-guest');

        if (showGuest) {
            link.style.display = 'inline-block';
        } else {
            link.style.display = loggedIn ? 'inline-block' : 'none';
        }

        if (link.dataset.authBound === 'true') return;
        link.dataset.authBound = 'true';

        link.addEventListener('click', async event => {
            if (isUserLoggedIn()) return;
            event.preventDefault();

            if (showGuest) {
                const message = link.dataset.authMessage || "You have to login/signup with your account to access the chat bot.";
                await CustomAuthModal.alert('Authentication Required', message);
            }

            window.location.href = 'login.html';
        });
    });
}

function bindSimpleLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn') || document.querySelector('.logout');
    if (!logoutBtn) return;

    logoutBtn.style.display = isUserLoggedIn() ? 'inline-block' : 'none';

    if (logoutBtn.dataset.authBound === 'true') return;
    logoutBtn.dataset.authBound = 'true';

    logoutBtn.addEventListener('click', event => {
        event.preventDefault();
        logoutAndRedirect();
    });
}

async function handleSignup(event) {
    event.preventDefault();

    console.log('--- Signup Process Started ---');
    const form = event.currentTarget;
    const name = document.getElementById('signup-name');
    const email = document.getElementById('signup-email');
    const password = document.getElementById('signup-password');
    const confirmPassword = document.getElementById('signup-confirm-password');

    console.log('Fields found:', {
        name: !!name,
        email: !!email,
        password: !!password,
        confirmPassword: !!confirmPassword
    });

    if (!name || !email || !password || !confirmPassword) {
        console.error('Critical Error: Some signup form fields were not found by ID.');
        setFormStatus(form, 'Technical error: Could not find all form fields.');
        return;
    }

    let isValid = true;
    clearFormStatus(form);

    if (name.value.trim().length < 3) {
        showError(name, 'Name must be at least 3 characters');
        isValid = false;
    } else {
        clearError(name);
    }

    if (!isValidEmail(email.value.trim())) {
        showError(email, 'Enter a valid email address');
        isValid = false;
    } else {
        clearError(email);
    }

    const passwordError = getPasswordValidationError(password.value);

    if (passwordError) {
        showError(password, passwordError);
        isValid = false;
    } else {
        clearError(password);
    }

    if (password.value !== confirmPassword.value) {
        showError(confirmPassword, 'Passwords do not match');
        isValid = false;
    } else {
        clearError(confirmPassword);
    }

    if (!isValid) {
        console.warn('Signup validation failed.');
        return;
    }

    const signupButton = form.querySelector('button[type="submit"]');
    const releaseButton = setButtonLoading(signupButton, '<i class="fas fa-spinner fa-spin"></i> Creating...');

    try {
        console.log('Sending signup request for:', email.value.trim());
        const payload = await requestAuth('/signup', {
            method: 'POST',
            body: JSON.stringify({
                fullName: name.value.trim(),
                email: email.value.trim(),
                password: password.value,
                confirmPassword: confirmPassword.value
            })
        });

        console.log('Signup successful, payload received:', payload);
        const user = applyAuthState(payload);
        setFormStatus(form, 'Account created successfully. Redirecting...', 'success');
        
        window.setTimeout(() => {
            const redirectUrl = getAuthPageRedirect(user.role);
            console.log('Redirecting to:', redirectUrl);
            window.location.href = redirectUrl;
        }, 1000); // Increased to 1s to allow user to see success message
    } catch (error) {
        console.error('Signup API Error:', error);
        if (error.details?.fullName) showError(name, error.details.fullName);
        if (error.details?.email) showError(email, error.details.email);
        if (error.details?.password) showError(password, error.details.password);
        if (error.details?.confirmPassword) showError(confirmPassword, error.details.confirmPassword);
        setFormStatus(form, error.message || 'Could not create your account.');
    } finally {
        releaseButton();
    }
}

async function handleLogin(event) {
    event.preventDefault();

    console.log('--- Login Process Started ---');
    const form = event.currentTarget;
    const email = document.getElementById('login-email') || form.querySelector('input[type="email"]');
    const password = document.getElementById('login-password') || form.querySelector('input[type="password"]') || form.querySelector('input[type="text"]');
    
    console.log('Fields found:', {
        email: !!email,
        password: !!password
    });

    let isValid = true;
    clearFormStatus(form);

    if (!email || !isValidEmail(email.value.trim())) {
        if (email) showError(email, 'Invalid email address');
        isValid = false;
    } else {
        clearError(email);
    }

    if (!password || password.value.trim() === '') {
        if (password) showError(password, 'Password cannot be empty');
        isValid = false;
    } else {
        clearError(password);
    }

    if (!isValid) {
        console.warn('Login validation failed.');
        return;
    }

    const loginButton = form.querySelector('button[type="submit"]');
    const releaseButton = setButtonLoading(loginButton, '<i class="fas fa-spinner fa-spin"></i> Signing In...');

    try {
        console.log('Sending login request for:', email.value.trim());
        const payload = await requestAuth('/login', {
            method: 'POST',
            body: JSON.stringify({
                email: email.value.trim(),
                password: password.value
            })
        });

        console.log('Login successful, payload received:', payload);
        const user = applyAuthState(payload);
        window.location.href = getAuthPageRedirect(user.role);
    } catch (error) {
        console.error('Login API Error:', error);
        if (password) showError(password, error.message || 'Invalid email or password.');
        setFormStatus(form, error.message || 'Invalid email or password.');
    } finally {
        releaseButton();
    }
}

function bindAuthForms() {
    const signupForm = document.querySelector('.signup-form');
    const loginForm = document.querySelector('.login-form');

    if (signupForm && signupForm.dataset.authBound !== 'true') {
        signupForm.dataset.authBound = 'true';
        signupForm.addEventListener('submit', handleSignup);
    }

    if (loginForm && loginForm.dataset.authBound !== 'true') {
        loginForm.dataset.authBound = 'true';
        loginForm.addEventListener('submit', handleLogin);
    }
}

async function initializePageAuth() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isProtectedPage = document.body.classList.contains('protected-page');
    const token = getStoredToken();

    bindAuthForms();
    bindProtectedLinks();
    bindSimpleLogoutButton();

    if (!token) {
        if (localStorage.getItem('isLoggedIn') === 'true' || getStoredCurrentUser()) {
            clearAuthState();
        }

        if (isProtectedPage) {
            window.location.href = 'login.html';
        }
        return;
    }

    let user = null;

    try {
        user = await syncCurrentUserFromServer();
    } catch (error) {
        console.error('Auth sync failed:', error);
    }

    if (!user) {
        if (isProtectedPage) {
            window.location.href = 'login.html';
        }
        return;
    }

    const role = user.role || 'student';

    if (document.body.classList.contains('student-page') && role !== 'student') {
        window.location.href = 'admin-dashboard.html';
        return;
    }

    if (document.body.classList.contains('admin-page') && role !== 'admin') {
        window.location.href = 'dashboard.html';
        return;
    }

    if (currentPage === 'login.html' || currentPage === 'signup.html') {
        window.location.href = getAuthPageRedirect(role);
    }
}

document.addEventListener('DOMContentLoaded', initializePageAuth);

window.AuthService = {
    applyAuthState,
    clearAuthState,
    getCurrentUser: getStoredCurrentUser,
    getToken: getStoredToken,
    isLoggedIn: isUserLoggedIn,
    logout: logoutAndRedirect,
    refreshCurrentUser: syncCurrentUserFromServer,
    requestAuth
};
