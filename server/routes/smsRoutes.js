const express = require('express');
const router = express.Router();
const smsSvc = require('../utils/smsService');
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');

// Allow connection without auth for the Phone SSE streaming client (with a secret api key or query param checks)
// We will secure it using req.query.apiKey or requireAuth based on headers.
router.get('/stream', async (req, res) => {
    const orgId = req.query.orgId || 'default';
    const apiKey = req.query.apiKey;

    // Optional: Validate API Key from configuration
    // We can fetch config for the org and match
    
    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Add client to active SSE clients map
    if (!smsSvc.sseClients.has(orgId)) {
        smsSvc.sseClients.set(orgId, []);
    }
    smsSvc.sseClients.get(orgId).push(res);

    console.log(`[SMS Gateway Stream] Client connected for org: ${orgId}`);

    // Keep connection alive by sending a comment ping every 20 seconds
    const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
        const clients = smsSvc.sseClients.get(orgId) || [];
        smsSvc.sseClients.set(orgId, clients.filter(c => c !== res));
        console.log(`[SMS Gateway Stream] Client disconnected for org: ${orgId}`);
    });
});

// Update SMS Status from the Phone Gateway (No auth required if valid apiKey or doc match)
router.post('/status', async (req, res) => {
    const { id, status, error, orgId = 'default' } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'id and status required' });

    try {
        const updateData = {
            status,
            updatedAt: new Date().toISOString(),
            ...(error ? { error } : {}),
            ...(status === 'sent' ? { sentAt: new Date().toISOString() } : {})
        };

        if (isAvailable()) {
            await db.collection(`orgs/${orgId}/sms_queue`).doc(id).update(updateData);
        } else {
            localStore.update('sms_queue', id, updateData);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Authenticated routes for the VGTC Admin dashboard
router.use(requireAuth, tenancyMiddleware);

// GET /api/sms/config — Get configuration
router.get('/config', async (req, res) => {
    try {
        const config = await smsSvc.getSmsConfig(req);
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sms/config — Save configuration
router.post('/config', async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const saved = await smsSvc.saveSmsConfig(req.body, req);
        res.json({ ok: true, config: saved });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sms/status — Check Gateway status
router.get('/status', async (req, res) => {
    try {
        const orgId = req.orgId || 'default';
        const activeConnections = (smsSvc.sseClients.get(orgId) || []).length;
        res.json({
            connected: activeConnections > 0,
            activeConnections,
            message: activeConnections > 0 ? `Phone Gateway Online (${activeConnections} device(s))` : 'Phone Gateway Offline'
        });
    } catch (err) {
        res.status(500).json({ connected: false, error: err.message });
    }
});

// POST /api/sms/test — Send test message
router.post('/test', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number is required' });

        const text = message || `VGTC Logistics Test SMS: Gateway is connected successfully at ${new Date().toLocaleTimeString()}!`;
        const result = await smsSvc.sendSms({ phone, message: text, req });
        res.json({ ok: true, result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
