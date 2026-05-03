const express = require('express');
const router = express.Router();
const authService = require('../utils/authService');
const { requireAdmin } = require('../middleware/auth');

// GET /api/users  (admin only — scoped to caller's org)
router.get('/', requireAdmin, async (req, res) => {
    try {
        let users = await authService.getAll();
        // Org admins only see their own org's users
        if (req.user.role === 'admin' && req.user.orgId) {
            users = users.filter(u => u.orgId === req.user.orgId);
        }
        // Superadmin sees all — optionally filter by query param
        if (req.user.role === 'superadmin' && req.query.orgId) {
            users = users.filter(u => u.orgId === req.query.orgId);
        }
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/users  (admin only)
router.post('/', requireAdmin, async (req, res) => {
    const { name, username, password, role, email, permissions, orgId } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password are required' });

    // Org admins can only create users within their org
    const targetOrgId = req.user.role === 'superadmin' ? (orgId || '') : (req.user.orgId || '');

    try {
        const user = await authService.createUser(name, username, password, role || 'user', email || '', permissions, targetOrgId);
        res.status(201).json(user);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/users/:id (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
    try {
        // Org admins can only update users in their org
        if (req.user.role === 'admin' && req.user.orgId) {
            const target = await authService.findById(req.params.id);
            if (!target || target.orgId !== req.user.orgId) {
                return res.status(403).json({ error: 'You can only manage users in your organization' });
            }
        }
        await authService.updateUser(req.params.id, req.body);
        res.json({ message: 'User updated successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/users/:id  (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        // Org admins can only delete users in their org
        if (req.user.role === 'admin' && req.user.orgId) {
            const target = await authService.findById(req.params.id);
            if (!target || target.orgId !== req.user.orgId) {
                return res.status(403).json({ error: 'You can only manage users in your organization' });
            }
        }
        await authService.deleteUser(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;

