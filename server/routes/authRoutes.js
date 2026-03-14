const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const authService = require('../utils/authService');
const { SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user = await authService.findByUsername(username);
        if (!user || !authService.verifyPassword(password, user.password))
            return res.status(401).json({ error: 'Invalid username or password' });

        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, role: user.role },
            SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, async (req, res) => {
    res.json(req.user);
});

module.exports = router;
