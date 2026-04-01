const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const authService = require('../utils/authService');
const emailService = require('../utils/emailService');
const { SECRET } = require('../middleware/auth');

const { isAvailable } = require('../firebase');

// GET /api/auth/status (Diagnostic)
router.get('/status', (req, res) => {
    const firebaseConnected = isAvailable();
    res.json({
        status: 'ok',
        database: firebaseConnected ? 'Firestore' : 'Local JSON (Fallback)',
        firebase: firebaseConnected ? 'connected' : 'disconnected',
        environment: process.env.NETLIFY ? 'netlify' : 'local',
        timestamp: new Date().toISOString(),
        note: !firebaseConnected ? 'To enable Firestore, add server/serviceAccountKey.json (local) or FIREBASE_SERVICE_ACCOUNT (Netlify)' : 'Firestore is active'
    });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user = await authService.findByUsername(username);
        if (!user || !authService.verifyPassword(password, user.password))
            return res.status(401).json({ error: 'Invalid username or password' });

        // Check if OTP is enabled
        if (user.isOtpEnabled && user.email) {
            const otp = authService.generateOTP();
            await authService.saveUserOTP(user.id, otp);
            await emailService.sendOTP(user.email, otp);
            return res.json({ requireOtp: true, userId: user.id, email: user.email });
        }

        // Success path (no OTP)
        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox },
            SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox } });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
    try {
        const { userId, code } = req.body;
        if (!userId || !code) return res.status(400).json({ error: 'User ID and OTP code required' });

        const isValid = await authService.verifyOTP(userId, code);
        if (!isValid) return res.status(401).json({ error: 'Invalid or expired OTP' });

        const user = await authService.findById(userId);
        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox },
            SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const user = await authService.findById(userId);
        if (!user || !user.email) return res.status(400).json({ error: 'User not found or no email set' });

        const otp = authService.generateOTP();
        await authService.saveUserOTP(user.id, otp);
        await emailService.sendOTP(user.email, otp);
        res.json({ message: 'OTP resent successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, async (req, res) => {
    res.json(req.user);
});

module.exports = router;
