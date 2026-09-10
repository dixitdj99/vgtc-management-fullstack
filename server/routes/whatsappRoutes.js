const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  checkWhatsAppStatus,
  sendWhatsAppMessage
} = require('../utils/whatsappService');

router.use(requireAuth);

// GET /api/whatsapp/config
router.get('/config', async (req, res) => {
  try {
    const config = await getWhatsAppConfig(req);
    res.json(config);
  } catch (err) {
    console.error('get whatsapp config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/config
router.post('/config', async (req, res) => {
  try {
    const saved = await saveWhatsAppConfig(req.body, req);
    res.json({ ok: true, config: saved });
  } catch (err) {
    console.error('save whatsapp config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/status
router.get('/status', async (req, res) => {
  try {
    const status = await checkWhatsAppStatus(req);
    res.json(status);
  } catch (err) {
    console.error('whatsapp status check error:', err);
    res.status(500).json({ connected: false, message: err.message });
  }
});

// POST /api/whatsapp/test
router.post('/test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }
    const msgText = message || 'Hello! This is a test message from VGTC Management via OpenWA Gateway.';
    const result = await sendWhatsAppMessage(phone, msgText, req);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('whatsapp test send error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
