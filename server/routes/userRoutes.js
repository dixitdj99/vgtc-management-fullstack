const express = require('express');
const router = express.Router();
const authService = require('../utils/authService');
const { requireAdmin } = require('../middleware/auth');

// GET /api/users  (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const users = await authService.getAll();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/users  (admin only)
router.post('/', requireAdmin, async (req, res) => {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password are required' });
    try {
        const user = await authService.createUser(name, username, password, role || 'user');
        res.status(201).json(user);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/users/:id  (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await authService.deleteUser(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
