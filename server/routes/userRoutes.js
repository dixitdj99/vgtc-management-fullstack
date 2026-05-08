const express = require('express');
const router = express.Router();
const authService = require('../utils/authService');
const orgService = require('../services/orgService');
const auditService = require('../services/auditService');
const { requireAdmin } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');

// Apply tenancy to all routes in this router
router.use(requireAdmin, tenancyMiddleware);

// GET /api/users  (admin only)
router.get('/', async (req, res) => {
    try {
        const users = await authService.getAll(req.orgId);
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/users  (admin only)
router.post('/', async (req, res) => {
    const { name, username, password, role, email, permissions } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password are required' });
    try {
        const org = await orgService.getById(req.orgId);

        // Resolve permissions: explicit > role template > org default
        let finalPermissions = null;
        if (permissions && Object.keys(permissions).length) {
            finalPermissions = permissions;
        } else if (role && role !== 'admin' && org?.config?.roleTemplates?.[role]) {
            finalPermissions = { ...org.config.roleTemplates[role] };
        } else {
            finalPermissions = org?.config?.defaultPermissions || null;
        }

        const user = await authService.createUser(name, username, password, role || 'user', email || '', finalPermissions, req.orgId);

        // Audit log
        auditService.logAction({
            orgId: req.orgId,
            action: auditService.ACTIONS.USER_CREATED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: user.id,
            targetType: 'user',
            before: null,
            after: { name, username, role: role || 'user', email: email || '', permissions: finalPermissions }
        });

        res.status(201).json(user);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/users/:id (admin only)
router.patch('/:id', async (req, res) => {
    try {
        // Security: verify target user belongs to same org
        const target = await authService.findById(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.orgId !== req.orgId) return res.status(403).json({ error: 'Cannot modify users from another organization' });

        const beforeState = { name: target.name, email: target.email, role: target.role, permissions: target.permissions, isOtpEnabled: target.isOtpEnabled, isSandbox: target.isSandbox };

        // If role changed and no explicit permissions in payload, apply role template
        if (req.body.role && req.body.role !== target.role && !req.body.permissions) {
            const org = await orgService.getById(req.orgId);
            if (req.body.role !== 'admin' && org?.config?.roleTemplates?.[req.body.role]) {
                req.body.permissions = { ...org.config.roleTemplates[req.body.role] };
            }
        }

        await authService.updateUser(req.params.id, req.body);

        // Audit log
        const afterState = { ...beforeState };
        ['name', 'email', 'role', 'permissions', 'isOtpEnabled', 'isSandbox'].forEach(k => {
            if (req.body[k] !== undefined) afterState[k] = req.body[k];
        });
        auditService.logAction({
            orgId: req.orgId,
            action: auditService.ACTIONS.USER_UPDATED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: req.params.id,
            targetType: 'user',
            before: beforeState,
            after: afterState
        });

        res.json({ message: 'User updated successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/users/:id  (admin only)
router.delete('/:id', async (req, res) => {
    try {
        // Security: verify target user belongs to same org
        const target = await authService.findById(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.orgId !== req.orgId) return res.status(403).json({ error: 'Cannot delete users from another organization' });

        await authService.deleteUser(req.params.id);

        // Audit log
        auditService.logAction({
            orgId: req.orgId,
            action: auditService.ACTIONS.USER_DELETED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: req.params.id,
            targetType: 'user',
            before: { name: target.name, username: target.username, role: target.role, email: target.email },
            after: null
        });

        res.json({ message: 'User deleted' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
