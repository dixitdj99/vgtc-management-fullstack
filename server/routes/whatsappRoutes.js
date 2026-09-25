const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  checkWhatsAppStatus,
  sendWhatsAppMessage,
  startWhatsAppSession,
  previewTemplate,
  generateLrReceiptHtml,
  generateVoucherHtml,
  getWhatsAppLogs,
  clearWhatsAppLogs
} = require('../utils/whatsappService');

router.use(requireAuth);

// GET /api/whatsapp/logs
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = getWhatsAppLogs(limit);
    res.json({ ok: true, logs });
  } catch (err) {
    console.error('get whatsapp logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/whatsapp/logs
router.delete('/logs', async (req, res) => {
  try {
    clearWhatsAppLogs();
    res.json({ ok: true, message: 'Logs cleared successfully' });
  } catch (err) {
    console.error('clear whatsapp logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

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

// POST /api/whatsapp/toggle
// Master toggle to turn automated WhatsApp messages ON or OFF in 1 click
router.post('/toggle', async (req, res) => {
  try {
    const config = await getWhatsAppConfig(req);
    const newEnabled = req.body.enabled !== undefined ? !!req.body.enabled : !config.enabled;
    const updated = await saveWhatsAppConfig({ ...config, enabled: newEnabled }, req);
    res.json({
      ok: true,
      enabled: updated.enabled,
      message: updated.enabled
        ? 'WhatsApp notifications enabled (Live)'
        : 'WhatsApp notifications turned OFF (Muted)'
    });
  } catch (err) {
    console.error('whatsapp toggle error:', err);
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

// POST /api/whatsapp/start-session
router.post('/start-session', async (req, res) => {
  try {
    const result = await startWhatsAppSession(req);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('whatsapp start session error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/test
router.post('/test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }
    const msgText = message || 'Hello! This is a test message from Vikas Goods Transport Co. via Meta WhatsApp Business Cloud API.';
    const result = await sendWhatsAppMessage(phone, msgText, req);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('whatsapp test send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/preview/:eventKey
// Returns a sample interpolated message for the given event key.
// Used by the Control Module to preview templates without sending.
router.get('/preview/:eventKey', async (req, res) => {
  try {
    const { eventKey } = req.params;
    const validKeys = [
      'lr_created', 'lr_created_owner', 'lr_created_driver', 'lr_loading_labour',
      'voucher_created', 'voucher_created_owner', 'voucher_created_driver',
      'balance_paid', 'cashout', 'deposit',
      'online_advance_clerk', 'online_advance_paid_owner', 'online_advance_paid_driver', 'online_advance_pending_reminder'
    ];
    if (!validKeys.includes(eventKey)) {
      return res.status(400).json({ error: `Unknown event key: ${eventKey}` });
    }
    const config = await getWhatsAppConfig(req);
    const preview = previewTemplate(eventKey, config);
    res.json({ eventKey, preview });
  } catch (err) {
    console.error('whatsapp preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/preview/receipt/lr
// Returns the LR receipt HTML for browser preview
router.get('/preview/receipt/lr', async (req, res) => {
  const sampleLr = {
    lrNo: '1042',
    date: new Date().toLocaleDateString('en-IN'),
    truckNo: 'HR55AA1234',
    destination: 'Rewari',
    partyName: 'M/S Sample Cement Traders',
    billing: 'To Pay',
    remark: 'Handle with care',
    freight: 5500,
    materials: [
      { type: 'OPC Cement', bags: 300, weight: 18 },
      { type: 'PPC Cement', bags: 100, weight: 6 },
    ],
    id: 'preview-sample-id'
  };
  const html = generateLrReceiptHtml(sampleLr);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// GET /api/whatsapp/preview/receipt/voucher
// Returns the Voucher HTML for browser preview
router.get('/preview/receipt/voucher', async (req, res) => {
  const sampleVoucher = {
    voucherNo: '501',
    lrNo: '1042',
    date: new Date().toLocaleDateString('en-IN'),
    truckNo: 'HR55AA1234',
    driverName: 'Ramesh Kumar',
    destination: 'Rewari',
    weight: 24,
    rate: 4500,
    advanceDiesel: 5000,
    advanceCash: 2000,
    advanceOnline: 0,
    munshi: 100,
    commission: 0,
    id: 'preview-voucher-id'
  };
  const html = generateVoucherHtml(sampleVoucher);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// POST /api/whatsapp/check-pending-advances
// Trigger check for unpaid online advances created before today and send WhatsApp reminders to clerk
router.post('/check-pending-advances', async (req, res) => {
  try {
    const { checkPendingOnlineAdvances } = require('../jobs');
    const result = await checkPendingOnlineAdvances({ forceAll: req.query.force === 'true' });
    res.json(result);
  } catch (err) {
    console.error('check-pending-advances error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
