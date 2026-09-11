const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  checkWhatsAppStatus,
  sendWhatsAppMessage,
  previewTemplate,
  generateLrReceiptHtml,
  generateVoucherHtml
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

// GET /api/whatsapp/preview/:eventKey
// Returns a sample interpolated message for the given event key.
// Used by the Control Module to preview templates without sending.
router.get('/preview/:eventKey', async (req, res) => {
  try {
    const { eventKey } = req.params;
    const validKeys = [
      'lr_created', 'lr_created_owner', 'lr_created_driver',
      'voucher_created', 'voucher_created_owner', 'voucher_created_driver',
      'balance_paid', 'cashout', 'deposit'
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

module.exports = router;
