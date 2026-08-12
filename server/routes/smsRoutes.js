const express = require('express');
const router = express.Router();
const whatsappSvc = require('../utils/whatsappService');
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');

router.use(requireAuth, tenancyMiddleware);

// GET /api/sms/config — Get configuration
router.get('/config', async (req, res) => {
    try {
        const config = await whatsappSvc.getWhatsAppConfig(req);
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
        const saved = await whatsappSvc.saveWhatsAppConfig(req.body, req);
        res.json({ ok: true, config: saved });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sms/status — Check Gateway status
router.get('/status', async (req, res) => {
    try {
        const status = await whatsappSvc.checkWhatsAppGatewayStatus(req);
        res.json(status);
    } catch (err) {
        res.status(500).json({ connected: false, error: err.message });
    }
});

// POST /api/sms/test — Send test message
router.post('/test', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number is required' });

        const text = message || `VGTC Logistics Test WhatsApp: Gateway is connected successfully at ${new Date().toLocaleTimeString()}!`;
        const result = await whatsappSvc.sendWhatsAppMessage({ phone, message: text, req });
        res.json({ ok: true, result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
