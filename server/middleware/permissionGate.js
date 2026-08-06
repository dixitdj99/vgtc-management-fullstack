/**
 * permissionGate.js — turn the permission tick boxes into something the server
 * actually enforces.
 *
 * `requirePermission` has existed in middleware/auth.js all along, but only
 * attendanceRoutes ever used it. Every other router sat behind `requireAuth`
 * alone, so a user granted *view* on the cashbook could still POST a deposit by
 * calling the API directly — the permissions described an intention nobody
 * checked.
 *
 * The gate is applied where routers are mounted rather than inside each router.
 * That keeps the whole mapping readable in one place, and avoids the trap of
 * registering a handler above a router's own middleware — which is how the
 * Kosli set-stock routes ended up running without an orgId.
 *
 * The HTTP method decides the action, so one line covers a whole router:
 *   GET/HEAD/OPTIONS → view    POST/PUT/PATCH → edit    DELETE → delete
 *
 * Several routers answer for more than one module — /api/vouchers serves JKL
 * Dump, JK Lakshmi and JK Super vouchers alike — so a gate accepts a list and
 * passes if ANY key satisfies the action. Gating those on a single key would
 * lock out someone who legitimately holds one of the others.
 */

const { permits } = require('./auth');

const ACTION_BY_METHOD = {
    GET: 'view',
    HEAD: 'view',
    OPTIONS: 'view',
    POST: 'edit',
    PUT: 'edit',
    PATCH: 'edit',
    DELETE: 'delete',
};

/**
 * @param {string|string[]} permKeys key, or keys where holding any one is enough
 * @returns {import('express').RequestHandler}
 */
const gate = (permKeys) => {
    const keys = Array.isArray(permKeys) ? permKeys : [permKeys];

    return (req, res, next) => {
        // Mounted after requireAuth everywhere, but say 401 rather than 403 if
        // that ever stops being true — "forbidden" would send someone hunting
        // for a missing permission when the real problem is a missing token.
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const action = ACTION_BY_METHOD[req.method] || 'edit';
        if (keys.some(k => permits(req.user, k, action))) return next();

        return res.status(403).json({
            error: `Requires ${action} permission for ${keys.join(' or ')}`,
        });
    };
};

module.exports = { gate, ACTION_BY_METHOD };
