const express = require('express');
const router = express.Router();
const orgService = require('../services/orgService');
const authService = require('../utils/authService');
const auditService = require('../services/auditService');
const { invalidate } = require('../utils/orgStatusCache');

const ensureAdmin = (req, res) => {
    if (req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return false;
    }
    return true;
};

// Get current organization details
router.get('/', async (req, res) => {
    try {
        const org = await orgService.getById(req.orgId || 'vgtc');
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        res.json(org);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/admin/overview', async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    try {
        const orgs = await orgService.getOverview();
        res.json(orgs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    try {
        const org = await orgService.createOrg(req.body);
        let adminUser = null;

        if (req.body.admin?.username && req.body.admin?.password && req.body.admin?.name) {
            adminUser = await authService.createUser(
                req.body.admin.name,
                req.body.admin.username,
                req.body.admin.password,
                'admin',
                req.body.admin.email || '',
                req.body.admin.permissions || req.body.defaultPermissions || req.body.config?.defaultPermissions || null,
                org.id
            );
            if (req.body.admin.isOtpEnabled) {
                await authService.updateUser(adminUser.id, { isOtpEnabled: true });
                adminUser.isOtpEnabled = true;
            }
        }

        res.status(201).json({ org, adminUser });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const orgId = req.params.id || req.orgId || 'vgtc';
        const org = await orgService.getById(orgId);
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        res.json(org);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch('/:id', async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    try {
        // Get before state for audit
        const beforeOrg = await orgService.getById(req.params.id);

        const payload = {};
        ['name', 'domain', 'logoUrl', 'status', 'moduleLabels', 'config'].forEach(field => {
            if (req.body[field] !== undefined) payload[field] = req.body[field];
        });
        const org = await orgService.updateOrg(req.params.id, payload);

        // Invalidate org cache so changes take effect immediately
        invalidate(req.params.id);

        // Audit log with before/after
        auditService.logAction({
            orgId: req.params.id,
            action: auditService.ACTIONS.ORG_UPDATED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: req.params.id,
            targetType: 'organization',
            before: beforeOrg ? { name: beforeOrg.name, status: beforeOrg.status, config: beforeOrg.config } : null,
            after: { name: org.name, status: org.status, config: org.config }
        });

        res.json(org);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
