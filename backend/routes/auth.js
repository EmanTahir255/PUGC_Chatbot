const express = require('express');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../db');
const { requireAuth, signAuthToken } = require('../middleware/auth');

const router = express.Router();
const PASSWORD_SALT_ROUNDS = 12;

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getPasswordValidationError(password) {
    if (password.length < 8) {
        return 'Password must be at least 8 characters.';
    }

    if (!/\d/.test(password)) {
        return 'Password must contain at least 1 number.';
    }

    if (!/^[A-Za-z0-9!@#$%^&*]+$/.test(password)) {
        return 'Password can only use letters, numbers, and these special characters: ! @ # $ % ^ & *.';
    }

    return '';
}

function buildPublicUser(record) {
    return {
        userId: record.user_id,
        name: record.full_name,
        fullName: record.full_name,
        email: record.email,
        role: record.role,
        isActive: Boolean(record.is_active),
        lastLoginAt: record.last_login_at,
        createdAt: record.created_at,
        updatedAt: record.updated_at
    };
}

async function findUserByEmail(pool, email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const result = await pool.request()
        .input('email', sql.NVarChar(255), normalizedEmail)
        .query(`
            SELECT TOP 1
                user_id,
                full_name,
                email,
                password_hash,
                role,
                is_active,
                last_login_at,
                created_at,
                updated_at
            FROM users
            WHERE LOWER(email) = @email
        `);

    return result.recordset[0] || null;
}

async function findUserById(pool, userId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT TOP 1
                user_id,
                full_name,
                email,
                password_hash,
                role,
                is_active,
                last_login_at,
                created_at,
                updated_at
            FROM users
            WHERE user_id = @userId
        `);

    return result.recordset[0] || null;
}

router.post('/signup', async (req, res) => {
    const fullName = normalizeName(req.body.fullName || req.body.name);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const confirmPassword = req.body.confirmPassword === undefined
        ? null
        : String(req.body.confirmPassword || '');
    const errors = {};

    if (fullName.length < 3) {
        errors.fullName = 'Full name must be at least 3 characters.';
    }

    if (!isValidEmail(email)) {
        errors.email = 'A valid email address is required.';
    }

    const passwordError = getPasswordValidationError(password);

    if (passwordError) {
        errors.password = passwordError;
    }

    if (confirmPassword !== null && password !== confirmPassword) {
        errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({
            error: 'Validation failed.',
            details: errors
        });
    }

    try {
        const pool = await getPool();
        const existingUser = await findUserByEmail(pool, email);

        if (existingUser) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
        const insertResult = await pool.request()
            .input('fullName', sql.NVarChar(150), fullName)
            .input('email', sql.NVarChar(255), email)
            .input('passwordHash', sql.NVarChar(255), passwordHash)
            .query(`
                INSERT INTO users (full_name, email, password_hash, role)
                OUTPUT
                    inserted.user_id,
                    inserted.full_name,
                    inserted.email,
                    inserted.role,
                    inserted.is_active,
                    inserted.last_login_at,
                    inserted.created_at,
                    inserted.updated_at
                VALUES (@fullName, @email, @passwordHash, 'student')
            `);

        const user = buildPublicUser(insertResult.recordset[0]);
        const token = signAuthToken(user);

        return res.status(201).json({
            message: 'Account created successfully.',
            token,
            user
        });
    } catch (error) {
        if (error.number === 2627 || error.number === 2601) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Failed to create account.' });
    }
});

router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!isValidEmail(email) || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const pool = await getPool();
        const userRecord = await findUserByEmail(pool, email);

        if (!userRecord) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (!userRecord.is_active) {
            return res.status(403).json({ error: 'This account has been deactivated.' });
        }

        const passwordMatches = await bcrypt.compare(password, userRecord.password_hash);

        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        await pool.request()
            .input('userId', sql.Int, userRecord.user_id)
            .query(`
                UPDATE users
                SET last_login_at = GETDATE()
                WHERE user_id = @userId
            `);

        const refreshedUserRecord = await findUserById(pool, userRecord.user_id);
        const user = buildPublicUser(refreshedUserRecord);
        const token = signAuthToken(user);

        return res.json({
            message: 'Login successful.',
            token,
            user
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Failed to log in.' });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const userRecord = await findUserById(pool, Number(req.auth.sub));

        if (!userRecord) {
            return res.status(401).json({ error: 'User not found.' });
        }

        if (!userRecord.is_active) {
            return res.status(403).json({ error: 'This account has been deactivated.' });
        }

        return res.json({
            user: buildPublicUser(userRecord)
        });
    } catch (error) {
        console.error('Current user lookup error:', error);
        return res.status(500).json({ error: 'Failed to load current user.' });
    }
});

router.post('/logout', (req, res) => {
    return res.json({
        message: 'Logout successful. Remove the token on the client side.'
    });
});

module.exports = router;
