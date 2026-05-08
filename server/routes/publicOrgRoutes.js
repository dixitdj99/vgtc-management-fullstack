const express = require('express');
const router = express.Router();
const orgService = require('../services/orgService');

// GET /api/org/public/branding/:orgId — no auth required
// Returns only safe public fields for the login page branding
router.get('/branding/:orgId', async (req, res) => {
    try {
        const org = await orgService.getById(req.params.orgId);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        res.json({
            id: org.id,
            name: org.name || '',
            logoUrl: org.logoUrl || '',
            status: org.status || 'active',
            primaryColor: org.config?.primaryColor || '#8b5cf6',
            accentColor: org.config?.accentColor || '#6366f1',
            businessType: org.config?.businessType || 'transport',
            locations: org.config?.locations || [],
            plan: org.config?.plan || ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
