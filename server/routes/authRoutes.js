const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const authService = require('../utils/authService');
const emailService = require('../utils/emailService');
const { ENV, getEnvPrefix } = require('../utils/envConfig');
const SECRET = process.env.JWT_SECRET;
const { isAvailable } = require('../firebase');
const stytchService = require('../utils/stytchService');
const { getEnvCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');

// Brute-force protection: 10 attempts per 15 min per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// OTP / password-reset: 5 per 10 min per IP
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { error: 'Too many OTP requests. Please wait before requesting again.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// GET /api/auth/status — unauthenticated liveness probe (used by Android terminal).
// Returns the minimum needed for connectivity checks. Internal infra details
// (env name, collection prefix, firebase status, stytch config) are NOT disclosed
// to unauthenticated callers — those leak the attack surface to anyone probing.
router.get('/status', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/auth/status/admin — full diagnostic, admin-only.
router.get('/status/admin', require('../middleware/auth').requireAdmin, (req, res) => {
    const firebaseConnected = isAvailable();
    res.json({
        status: 'ok',
        appEnv: ENV,
        collectionPrefix: getEnvPrefix() || '(none — production)',
        database: firebaseConnected ? 'Firestore' : 'Local JSON (Fallback)',
        firebase: firebaseConnected ? 'connected' : 'disconnected',
        stytchConfigured: stytchService.isStytchConfigured(),
        environment: process.env.K_SERVICE ? 'app-hosting' : 'local',
        timestamp: new Date().toISOString(),
    });
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username/Email and password required' });

        // Check if username is an email address, or find by username
        let user = await authService.findByUsername(username);
        let emailToAuth = null;

        if (user) {
            emailToAuth = user.email || `${username}@vgtc.com`;
        } else if (username.includes('@')) {
            // FIX #6: Global lookup — never scope by caller-supplied orgId to prevent cross-tenant enumeration
            const allUsers = await authService.getAll('vgtc');
            user = allUsers.find(u => u.email.toLowerCase() === username.toLowerCase());
            if (user) {
                emailToAuth = user.email;
            } else {
                emailToAuth = username;
            }
        } else {
            emailToAuth = `${username}@vgtc.com`;
        }

        // Authenticate password (with fallback to local bcrypt if Stytch throws/fails)
        if (stytchService.isStytchConfigured() && emailToAuth) {
            try {
                await stytchService.authenticate(emailToAuth, password);
            } catch (err) {
                console.warn('[Auth] Stytch auth failed, falling back to local bcrypt validation:', err.message);
                if (!user || !authService.verifyPassword(password, user.password)) {
                    return res.status(401).json({ error: 'Invalid username/email or password' });
                }
            }
        } else {
            // Fallback to local bcrypt validation
            if (!user || !authService.verifyPassword(password, user.password))
                return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Ensure user is registered in system DB
        if (!user) {
            return res.status(401).json({ error: 'User authenticated in Stytch but not registered in the system.' });
        }

        // Plant/Godown access enforcement for non-admin users
        if (user.role !== 'admin') {
            const perms = user.permissions || {};
            const allowedPlants = perms.allowedPlants;
            const allowedGodowns = perms.allowedGodowns;
            const requestedPlant = req.body.plant;
            const requestedGodown = req.body.godown;

            if (Array.isArray(allowedPlants)) {
                if (!requestedPlant || !allowedPlants.includes(requestedPlant)) {
                    const plantName = requestedPlant || '(none selected)';
                    return res.status(403).json({
                        error: `Access Denied: Your account is not authorized for ${plantName}. Contact your administrator.`
                    });
                }
                if (requestedPlant === 'jksuper') {
                    if (!requestedGodown) {
                        return res.status(403).json({ error: 'Access Denied: Please select a Godown for JK Super.' });
                    }
                    if (Array.isArray(allowedGodowns) && !allowedGodowns.includes(requestedGodown)) {
                        return res.status(403).json({
                            error: `Access Denied: Your account is not authorized for the ${requestedGodown} godown. Contact your administrator.`
                        });
                    }
                }
            }
        }

        // Success
        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox },
            SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox } });

    } catch (err) {
        console.error('[Auth] Login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
    res.status(403).json({ error: 'Public registration is disabled. Please contact your administrator to create an account.' });
});

// POST /api/auth/forgot-password
// FIX #3: Rate-limited with otpLimiter
router.post('/forgot-password', otpLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Verify the user exists in our local database
        const getUCol = () => getEnvCol('users');
        let user = null;
        if (isAvailable()) {
            const { db } = require('../firebase');
            const snapshot = await db.collection(getUCol()).where('email', '==', email).limit(1).get();
            if (!snapshot.empty) {
                user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
        } else {
            user = localStore.getAll(getUCol()).find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        }

        // FIX #5: Never confirm or deny whether the email is registered (prevents user enumeration)
        if (!user) {
            return res.json({ message: 'If that email is registered, a password reset link has been sent.' });
        }

        // FIX #1: Allowlisted origins only — never trust caller-supplied Origin header directly
        const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        const requestOrigin = req.headers.origin || '';
        const origin = ALLOWED_ORIGINS.find(o => o === requestOrigin) || ALLOWED_ORIGINS[0] || 'https://vgtc.site';
        const redirectUrl = `${origin}/reset-password`;

        await stytchService.resetPasswordStart(email, redirectUrl);
        res.json({ message: 'If that email is registered, a password reset link has been sent.' });
    } catch (err) {
        // FIX #7: Log full error server-side; send only a safe generic message to client
        console.error('[Auth] Forgot password error:', err);
        res.status(500).json({ error: 'Operation failed. Please try again.' });
    }
});

// POST /api/auth/reset-password
// FIX #4: Rate-limited with otpLimiter
router.post('/reset-password', otpLimiter, async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ error: 'Reset token and new password are required' });
        }

        // Complete password reset in Stytch
        const stytchRes = await stytchService.resetPasswordComplete(token, password);
        const email = stytchRes.user?.emails?.[0]?.email;
        if (!email) {
            throw new Error('Email not found in Stytch response');
        }

        // Find user locally by email
        const getUCol = () => getEnvCol('users');
        let user = null;
        if (isAvailable()) {
            const { db } = require('../firebase');
            const snapshot = await db.collection(getUCol()).where('email', '==', email).limit(1).get();
            if (!snapshot.empty) {
                user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
        } else {
            user = localStore.getAll(getUCol()).find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found in system database' });
        }

        // Sync local password directly to bypass redundant Stytch update
        const bcryptHash = require('bcryptjs').hashSync(password, 12);
        if (isAvailable()) {
            const { db } = require('../firebase');
            await db.collection(getUCol()).doc(user.id).update({ password: bcryptHash });
        } else {
            localStore.update(getUCol(), user.id, { password: bcryptHash });
        }

        res.json({ message: 'Password reset successful. You can now login with your new password.' });
    } catch (err) {
        // FIX #7: Log full error server-side; send only a safe generic message to client
        console.error('[Auth] Reset password error:', err);
        res.status(400).json({ error: 'Password reset failed. The link may be invalid or expired. Please request a new one.' });
    }
});

// POST /api/auth/verify-otp
// FIX #2: Rate-limited with otpLimiter
router.post('/verify-otp', otpLimiter, async (req, res) => {
    try {
        const { userId, code } = req.body;
        if (!userId || !code) return res.status(400).json({ error: 'User ID and OTP code required' });

        const isValid = await authService.verifyOTP(userId, code);
        if (!isValid) return res.status(401).json({ error: 'Invalid or expired OTP' });

        const user = await authService.findById(userId);

        // Plant/Godown access enforcement for non-admin users
        if (user.role !== 'admin') {
            const perms = user.permissions || {};
            const allowedPlants = perms.allowedPlants;
            const allowedGodowns = perms.allowedGodowns;
            const requestedPlant = req.body.plant;
            const requestedGodown = req.body.godown;

            if (Array.isArray(allowedPlants)) {
                if (!requestedPlant || !allowedPlants.includes(requestedPlant)) {
                    const plantName = requestedPlant || '(none selected)';
                    return res.status(403).json({
                        error: `Access Denied: Your account is not authorized for ${plantName}. Contact your administrator.`
                    });
                }
                if (requestedPlant === 'jksuper') {
                    if (!requestedGodown) {
                        return res.status(403).json({ error: 'Access Denied: Please select a Godown for JK Super.' });
                    }
                    if (Array.isArray(allowedGodowns) && !allowedGodowns.includes(requestedGodown)) {
                        return res.status(403).json({
                            error: `Access Denied: Your account is not authorized for the ${requestedGodown} godown. Contact your administrator.`
                        });
                    }
                }
            }
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox },
            SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions: user.permissions, isSandbox: !!user.isSandbox } });
    } catch (err) {
        // FIX #7: Log full error server-side; send only a safe generic message to client
        console.error('[Auth] Verify OTP error:', err);
        res.status(500).json({ error: 'Operation failed. Please try again.' });
    }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', otpLimiter, async (req, res) => {
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
        // FIX #7: Log full error server-side; send only a safe generic message to client
        console.error('[Auth] Resend OTP error:', err);
        res.status(500).json({ error: 'Operation failed. Please try again.' });
    }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
    res.json(req.user);
});

module.exports = router;
