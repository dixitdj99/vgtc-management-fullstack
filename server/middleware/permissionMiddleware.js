const { getOrgCached } = require('../utils/orgStatusCache');

/**
 * Permission Middleware
 * Checks if the authenticated user has the required permission in their permissions object.
 * Also enforces org-level module toggles (enabledModules).
 * @param {string} permissionKey - The key of the permission to check (e.g., 'lr', 'voucher', 'balance_sheet')
 * @param {string} action - 'view' or 'edit'
 */
const requirePermission = (permissionKey, action = 'view') => {
    return async (req, res, next) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Check org-level module toggle
        try {
            const org = await getOrgCached(user.orgId);
            if (org?.config?.enabledModules && org.config.enabledModules[permissionKey] === false) {
                return res.status(403).json({ error: `The ${permissionKey} module is not enabled for your organization.` });
            }
        } catch (err) {
            // If cache fails, don't block — just skip the org check
        }

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
