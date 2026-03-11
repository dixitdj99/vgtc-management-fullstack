const express = require('express');
const router = express.Router();
const authService = require('../utils/authService');
const { requireAdmin } = require('../middleware/auth');

// GET /api/users  (admin only)
router.get('/', requireAdmin, (req, res) => {
    res.json(authService.getAll());
});

// POST /api/users  (admin only)
router.post('/', requireAdmin, (req, res) => {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password are required' });
    try {
        const user = authService.createUser(name, username, password, role || 'user');
        res.status(201).json(user);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/users/:id  (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
    try {
        authService.deleteUser(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
