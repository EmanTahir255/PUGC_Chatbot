const jwt = require('jsonwebtoken');

const DEFAULT_JWT_SECRET = 'pugc-smartbot-dev-secret-change-me';
const DEFAULT_JWT_EXPIRES_IN = '7d';

function getJwtSecret() {
    return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

function getJwtExpiresIn() {
    return process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;
}

function signAuthToken(user) {
    return jwt.sign(
        {
            sub: user.userId,
            email: user.email,
            role: user.role,
            name: user.name
        },
        getJwtSecret(),
        { expiresIn: getJwtExpiresIn() }
    );
}

function extractBearerToken(req) {
    const header = String(req.header('Authorization') || '').trim();
    if (!header.toLowerCase().startsWith('bearer ')) {
        return null;
    }

    const token = header.slice(7).trim();
    return token || null;
}

function requireAuth(req, res, next) {
    const token = extractBearerToken(req);

    if (!token) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
        req.auth = jwt.verify(token, getJwtSecret());
        return next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

function requireRole(...allowedRoles) {
    const normalizedRoles = allowedRoles.map(role => String(role).toLowerCase());

    return (req, res, next) => {
        const role = String(req.auth?.role || '').toLowerCase();

        if (!role || !normalizedRoles.includes(role)) {
            return res.status(403).json({ error: 'You do not have permission to access this resource.' });
        }

        return next();
    };
}

module.exports = {
    extractBearerToken,
    getJwtExpiresIn,
    getJwtSecret,
    requireAuth,
    requireRole,
    signAuthToken
};
