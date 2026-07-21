const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');
const { requireAuth } = require('../middleware/auth');

const SETTINGS_COL = 'system_settings';
const SETTINGS_DOC_ID = 'global_config';

router.use(requireAuth);

const ensureAdmin = (req, res) => {
    if (req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return false;
    }
    return true;
};

// GET system settings
router.get('/', async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    try {
        let settings = null;
        if (!isAvailable()) {
            settings = localStore.getById(SETTINGS_COL, SETTINGS_DOC_ID);
        } else {
            const doc = await db.collection(getCol(SETTINGS_COL, req)).doc(SETTINGS_DOC_ID).get();
            if (doc.exists) settings = { id: doc.id, ...doc.data() };
        }

        if (!settings) {
            // Default configuration
            settings = {
                id: SETTINGS_DOC_ID,
                nicEway: {
                    gstin: process.env.EWAY_GSTIN || '06AAAAA0000A1Z5',
                    username: process.env.EWAY_USERNAME || '',
                    password: process.env.EWAY_PASSWORD || '',
                    clientId: process.env.EWAY_CLIENT_ID || '',
                    clientSecret: process.env.EWAY_CLIENT_SECRET || '',
                    env: process.env.EWAY_ENV || 'sandbox'
                },
                smtp: {
                    host: process.env.SMTP_HOST || 'smtp.gmail.com',
                    port: process.env.SMTP_PORT || '587',
                    user: process.env.SMTP_USER || '',
                    pass: process.env.SMTP_PASS ? '••••••••' : ''
                },
                org: {
                    name: 'VGTC Logistics Management',
                    phone: '+91 9812000000',
                    address: 'Kosli / Jhajjar / Jharli'
                }
            };
        }

        res.json(settings);
    } catch (err) {
        console.error('get system settings error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST / PATCH update system settings
router.post('/', async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    try {
        const payload = {
            ...req.body,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.name
        };

        if (!isAvailable()) {
            localStore.update(SETTINGS_COL, SETTINGS_DOC_ID, payload);
        } else {
            await db.collection(getCol(SETTINGS_COL, req)).doc(SETTINGS_DOC_ID).set(payload, { merge: true });
        }

        res.json({ ok: true, settings: payload });
    } catch (err) {
        console.error('update system settings error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
