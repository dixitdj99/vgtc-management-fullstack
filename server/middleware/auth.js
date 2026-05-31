const jwt = require('jsonwebtoken');
const { isProduction, ENV } = require('../utils/envConfig');
const SECRET = process.env.JWT_SECRET || 'vgtc-secret-2026';

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
 * requirePermission(permKey, action) — Middleware factory for granular permission checks.
 * Permission levels: view < edit < delete. Admins bypass all checks.
 * Usage: router.delete('/:id', requirePermission('balance', 'delete'), handler)
 */
const requirePermission = (permKey, action = 'view') => (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user.role === 'admin') return next();
        const perm = req.user.permissions?.[permKey];
        if (!perm) return res.status(403).json({ error: `No access to ${permKey}` });
        const allows = { view: ['view', 'edit', 'delete'], edit: ['edit', 'delete'], delete: ['delete'] };
        if ((allows[action] || []).includes(perm)) return next();
        return res.status(403).json({ error: `Requires ${action} permission for ${permKey}` });
    });
};

module.exports = { requireAuth, requireAdmin, preventProdWrite, requirePermission, SECRET };
