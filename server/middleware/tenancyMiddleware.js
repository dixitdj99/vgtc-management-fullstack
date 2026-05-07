const tenancyMiddleware = (req, res, next) => {
    // req.user is populated by requireAuth middleware
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required for tenancy' });
    }

    // Default to 'vgtc' if orgId is missing (for legacy or initial setup)
    req.orgId = req.user.orgId || 'vgtc';
    next();
};

module.exports = { tenancyMiddleware };
