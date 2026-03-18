/**
 * Permission Middleware
 * Checks if the authenticated user has the required permission in their permissions object.
 * @param {string} permissionKey - The key of the permission to check (e.g., 'lr', 'voucher', 'balance_sheet')
 * @param {string} action - 'view' or 'edit'
 */
const requirePermission = (permissionKey, action = 'view') => {
    return (req, res, next) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Admins have all permissions
        if (user.role === 'admin') return next();

        const perms = user.permissions || {};
        const userPerm = perms[permissionKey];

        if (!userPerm) {
            return res.status(403).json({ error: `Not authorized to access ${permissionKey}` });
        }

        if (action === 'edit' && userPerm !== 'edit') {
            return res.status(403).json({ error: `Not authorized to perform edits on ${permissionKey}` });
        }

        next();
    };
};

module.exports = { requirePermission };
