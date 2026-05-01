// ==============================
// Common Helpers
// ==============================
function showError(input, message) {
    let error = input.parentElement.querySelector(".error-msg");

    if (!error) {
        error = document.createElement("small");
        error.className = "error-msg";
        input.parentElement.appendChild(error);
    }

    error.innerText = message;
    input.classList.add("error");
}

function clearError(input) {
    const error = input.parentElement.querySelector(".error-msg");
    if (error) error.remove();
    input.classList.remove("error");
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==============================
// GLOBAL AUTH STATE
// ==============================
function isUserLoggedIn() {
    return (
        sessionStorage.getItem("isLoggedIn") === "true" ||
        localStorage.getItem("isLoggedIn") === "true"
    );
}

function getStoredUserRole() {
    let currentUser = null;

    try {
        currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
    } catch (error) {
        currentUser = null;
    }

    const storedRole = localStorage.getItem("userRole") || currentUser?.role;
    if (storedRole) return storedRole;

    const email = currentUser?.email || localStorage.getItem("userEmail") || "";
    return email.toLowerCase().includes("admin") ? "admin" : "student";
}

// ==============================
// SIGNUP VALIDATION
// ==============================
const signupForm = document.querySelector(".signup-form");

if (signupForm) {
    signupForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const name = signupForm.querySelector('input[type="text"]');
        const email = signupForm.querySelector('input[type="email"]');
        const password = signupForm.querySelectorAll('input[type="password"]')[0];
        const confirmPassword = signupForm.querySelectorAll('input[type="password"]')[1];

        let isValid = true;

        if (name.value.trim().length < 3) { showError(name, "Name must be at least 3 characters"); isValid = false; } else clearError(name);
        if (!isValidEmail(email.value.trim())) { showError(email, "Enter a valid email address"); isValid = false; } else clearError(email);
        if (password.value.length < 6) { showError(password, "Password must be at least 6 characters"); isValid = false; } else clearError(password);
        if (password.value !== confirmPassword.value) { showError(confirmPassword, "Passwords do not match"); isValid = false; } else clearError(confirmPassword);

        if (!isValid) return;

        // Determine role (admin if email contains "admin")
        const role = email.value.toLowerCase().includes("admin") ? "admin" : "student";

        // AUTH STATE
        sessionStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userRole", role);
        localStorage.setItem("userEmail", email.value.trim());

        // SAVE CURRENT USER for checkout & chatbot
        const user = {
            name: name.value.trim(),
            email: email.value.trim(),
            features: [], // initially empty
            subscription: { status: "free" },
            role: role
        };
        localStorage.setItem("currentUser", JSON.stringify(user));

        // Save to global users array
        let users = JSON.parse(localStorage.getItem('users') || '[]');

        // Prevent duplicate signup
        const exists = users.some(u => u.email === user.email);
        if (!exists) {
            users.push(user);
            localStorage.setItem('users', JSON.stringify(users));
        }

        // REDIRECT based on role
        if (role === "admin") {
            window.location.href = "admin-dashboard.html";
        } else {
            window.location.href = "dashboard.html";
        }
    });
}


// ==============================
// LOGIN VALIDATION
// ==============================
const loginForm = document.querySelector(".login-form");

if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const email = loginForm.querySelector('input[type="email"]');
        const password = loginForm.querySelector('input[type="password"]');

        let isValid = true;

        if (!isValidEmail(email.value.trim())) { showError(email, "Invalid email address"); isValid = false; } else clearError(email);
        if (password.value.trim() === "") { showError(password, "Password cannot be empty"); isValid = false; } else clearError(password);

        if (!isValid) return;

        // AUTH STATE
        sessionStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userEmail", email.value.trim());

        // Determine role
        let role = email.value.toLowerCase().includes("admin") ? "admin" : "student";
        localStorage.setItem("userRole", role);

        // SAVE CURRENT USER for checkout
        let currentUser = {
            email: email.value.trim(),
            features: [],
            subscription: { status: "free" },
            role: role
        };

        if (role === "admin") {
            currentUser.name = "Admin"; // Admin name
        } else {
            // For students, try to find them in users array saved during signup
            const users = JSON.parse(localStorage.getItem('users') || '[]');
            const foundUser = users.find(u => u.email === email.value.trim());
            currentUser.name = foundUser ? foundUser.name : ""; // use name if exists, else blank
            currentUser.features = foundUser ? foundUser.features || [] : [];
            currentUser.subscription = foundUser ? foundUser.subscription || { status: "free" } : { status: "free" };
        }

        localStorage.setItem("currentUser", JSON.stringify(currentUser));

        // REDIRECT BASED ON ROLE
        if (role === "admin") {
            window.location.href = "admin-dashboard.html";
        } else {
            window.location.href = "dashboard.html";
        }
    });
}


// ==============================
// PAGE PROTECTION
// ==============================
document.addEventListener("DOMContentLoaded", () => {
    const loggedIn = isUserLoggedIn();
    const role = getStoredUserRole();

    if (loggedIn && role && !localStorage.getItem("userRole")) {
        localStorage.setItem("userRole", role);
    }

    // Protect pages
    if (document.body.classList.contains("protected-page") && !loggedIn) {
        window.location.href = "login.html";
        return;
    }

    // Role-based protection
    if (document.body.classList.contains("student-page") && role !== "student") {
        window.location.href = "admin-dashboard.html";
        return;
    }

    if (document.body.classList.contains("admin-page") && role !== "admin") {
        window.location.href = "dashboard.html";
        return;
    }

    // Protected links
    document.querySelectorAll(".protected").forEach(link => {
        link.style.display = loggedIn ? "inline-block" : "none";

        link.addEventListener("click", function (e) {
            if (!isUserLoggedIn()) {
                e.preventDefault();
                window.location.href = "login.html";
            }
        });
    });

    // Logout
    const logoutBtn = document.getElementById("logoutBtn") || document.querySelector(".logout");
    if (logoutBtn) {
        logoutBtn.style.display = loggedIn ? "inline-block" : "none";

        logoutBtn.addEventListener("click", () => {
            sessionStorage.clear();
            localStorage.removeItem("isLoggedIn");
            localStorage.removeItem("userEmail");
            localStorage.removeItem("userRole");
            localStorage.removeItem("currentUser"); // also remove currentUser

            window.location.href = "login.html";
        });
    }
});
