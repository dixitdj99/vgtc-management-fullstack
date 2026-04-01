const jwt = require('jsonwebtoken');
const { isProduction, ENV } = require('../utils/envConfig');
const SECRET = process.env.JWT_SECRET || 'vgtc-secret-2026';

const requireAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(auth.slice(7), SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
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

module.exports = { requireAuth, requireAdmin, preventProdWrite, SECRET };
