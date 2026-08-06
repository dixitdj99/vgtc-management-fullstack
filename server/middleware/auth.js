const jwt = require('jsonwebtoken');
const { isProduction, ENV } = require('../utils/envConfig');

// Fail loudly if JWT_SECRET is missing in production
if (isProduction() && !process.env.JWT_SECRET) {
    console.error('[SECURITY] JWT_SECRET env var is not set in production! Refusing to start.');
    process.exit(1);
}
const SECRET = process.env.JWT_SECRET || 'vgtc-dev-secret-change-in-prod';

const requireAuth = async (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(auth.slice(7), SECRET);
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        res.status(403).json({ error: err.message });
    }
};

const requireAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        next();
    });
};

/**
 * preventProdWrite — Optional safety net to block all write operations
 * when running outside of production.
 *
 * Enable by setting BLOCK_PROD_WRITES=true in your .env (local dev).
 * This is a secondary guard — the primary isolation is the collection prefix.
 * Use this if you EVER need read-only access to another environment's data.
 */
const preventProdWrite = (req, res, next) => {
    const shouldBlock = process.env.BLOCK_PROD_WRITES === 'true';
    if (shouldBlock && !isProduction()) {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            return res.status(403).json({
                error: `Write blocked: server is running in "${ENV}" mode.`,
                hint: 'Set APP_ENV=production and BLOCK_PROD_WRITES=false to enable writes.'
            });
        }
    }
    next();
};

/**
 * The permission ladder: holding a level grants everything below it, so
 * `delete` implies `edit` implies `view`. Exported because permissionGate.js
 * answers the same question for several keys at once, and two copies of this
 * table would eventually disagree.
 */
const PERMISSION_LADDER = {
    view: ['view', 'edit', 'delete'],
    edit: ['edit', 'delete'],
    delete: ['delete'],
};

/** Does this user's stored level satisfy `action` on `permKey`? Admins always do. */
const permits = (user, permKey, action) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return (PERMISSION_LADDER[action] || []).includes(user.permissions?.[permKey]);
};

/**
 * requirePermission(permKey, action) — Middleware factory for granular permission checks.
 * Permission levels: view < edit < delete. Admins bypass all checks.
 * Usage: router.delete('/:id', requirePermission('balance', 'delete'), handler)
 */
const requirePermission = (permKey, action = 'view') => (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user.role === 'admin') return next();
        const perm = req.user.permissions?.[permKey];
        if (!perm) return res.status(403).json({ error: `No access to ${permKey}` });
        if (permits(req.user, permKey, action)) return next();
        return res.status(403).json({ error: `Requires ${action} permission for ${permKey}` });
    });
};

module.exports = { requireAuth, requireAdmin, preventProdWrite, requirePermission, permits, PERMISSION_LADDER, SECRET };
