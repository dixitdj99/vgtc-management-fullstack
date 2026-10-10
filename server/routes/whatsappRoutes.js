const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getDelivery, getRecentDeliveries } = require('../utils/whatsappDeliveryStore');
const { permits } = require('../middleware/auth');
const inbox = require('../utils/whatsappInboxStore');
const {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  setWhatsAppEnabled,
  checkWhatsAppStatus,
  sendWhatsAppMessage,
  sendMetaTemplate,
  sendWhatsAppImage,
  sendEventNotification,
  previewTemplate,
  generateLrReceiptHtml,
  generateVoucherHtml,
  generateVoucherImageBuffer,
  lookupVehiclePhone,
  getWhatsAppLogs,
  clearWhatsAppLogs
} = require('../utils/whatsappService');

router.use(requireAuth);

const inboxPermission = action => (req, res, next) => {
  if (['whatsapp', 'whatsapp_main', 'whatsapp_dump', 'whatsapp_jkl', 'whatsapp_jharli']
    .some(key => permits(req.user, key, action))) return next();
  return res.status(403).json({ error: 'WhatsApp inbox access required' });
};
const validInboxPhone = phone => /^\d{10,15}$/.test(inbox.normalizePhone(phone));

router.get('/conversations', inboxPermission('view'), async (req, res) => {
  try {
    res.json({ conversations: await inbox.listConversations() });
  } catch (error) {
    console.error('WhatsApp inbox list error:', error);
    res.status(500).json({ error: 'Could not load conversations' });
  }
});

router.get('/conversations/:phone/messages', inboxPermission('view'), async (req, res) => {
  if (!validInboxPhone(req.params.phone)) return res.status(400).json({ error: 'Invalid phone number' });
  try {
    res.json({ messages: await inbox.getMessages(req.params.phone) });
  } catch (error) {
    console.error('WhatsApp inbox messages error:', error);
    res.status(500).json({ error: 'Could not load messages' });
  }
});

router.post('/conversations/:phone/read', inboxPermission('edit'), async (req, res) => {
  if (!validInboxPhone(req.params.phone)) return res.status(400).json({ error: 'Invalid phone number' });
  try {
    res.json({ ok: true, conversation: await inbox.markRead(req.params.phone) });
  } catch (error) {
    console.error('WhatsApp inbox read error:', error);
    res.status(500).json({ error: 'Could not mark conversation read' });
  }
});

router.post('/conversations/:phone/reply', inboxPermission('edit'), async (req, res) => {
  if (!validInboxPhone(req.params.phone)) return res.status(400).json({ error: 'Invalid phone number' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 4096) return res.status(400).json({ error: 'Message must contain 1 to 4096 characters' });
  try {
    const conversation = await inbox.getConversation(req.params.phone);
    if (!inbox.canReply(conversation)) {
      return res.status(409).json({ error: 'Freeform replies are available for 24 hours after the customer’s last message. Ask them to message again or use an approved template.' });
    }
    // Operator replies are independent of the automation master toggle.
    const result = await sendWhatsAppMessage(req.params.phone, message, req, { bypassEnabledCheck: true });
    res.json({ ok: true, result, message: 'Meta accepted the reply' });
  } catch (error) {
    const metaError = error.response?.data?.error;
    const detail = metaError?.message || error.message || 'Could not send reply';
    res.status(metaError ? 400 : 502).json({ error: detail });
  }
});

// Durable Meta message state; accepted is not proof of recipient delivery.
router.get('/delivery/:messageId', async (req, res) => {
  try {
    if (req.params.messageId.length > 512) return res.status(400).json({ error: 'Invalid message ID' });
    const delivery = await getDelivery(req.params.messageId);
    if (!delivery) return res.status(404).json({ error: 'No delivery status recorded for this message ID' });
    res.json({ ok: true, delivery });
  } catch (err) {
    console.error('get whatsapp delivery error:', err);
    res.status(500).json({ error: 'Could not read delivery status' });
  }
});

router.get('/deliveries', async (req, res) => {
  try {
    res.json({ ok: true, deliveries: await getRecentDeliveries(req.query.limit) });
  } catch (err) {
    console.error('get whatsapp deliveries error:', err);
    res.status(500).json({ error: 'Could not read delivery statuses' });
  }
});

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
    const newEnabled = typeof req.body.enabled === 'boolean'
      ? req.body.enabled
      : !(await getWhatsAppConfig(req)).enabled;
    const enabled = await setWhatsAppEnabled(newEnabled);
    res.json({
      ok: true,
      enabled,
      message: enabled
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

// POST /api/whatsapp/test
// Dispatch a test message to verify WhatsApp Meta Cloud API integration and credentials
router.post('/test', async (req, res) => {
  try {
    const { phone, message, templateName, languageCode, components: rawComponents } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Recipient mobile number is required' });
    }

    let result;
    const tName = templateName || 'hello'; // Default to the verified approved template
    let lang = languageCode || 'en';
    let comps = rawComponents;

    if (tName === 'hello') {
      lang = 'en';
      if (!comps || !comps.length) {
        comps = [{
          type: 'body',
          parameters: [
            { type: 'text', text: '1001' },
            { type: 'text', text: '501' },
            { type: 'text', text: new Date().toLocaleDateString('en-IN') },
            { type: 'text', text: 'HR55AA1234' },
            { type: 'text', text: 'Jharli' },
            { type: 'text', text: 'Rewari' },
            { type: 'text', text: 'Cement' },
            { type: 'text', text: '25' }
          ]
        }];
      }
    } else if (tName === '3p_direct_integration_test_template') {
      lang = 'en_US';
      comps = [];
    }

    if (tName && tName !== 'none' && tName !== 'custom_text') {
      result = await sendMetaTemplate(
        phone,
        tName,
        lang,
        comps || [],
        req,
        { bypassEnabledCheck: true }
      );
    } else {
      const text = message || 'Hello! Test WhatsApp message from Vikas Goods Transport Co. Your Meta Cloud API integration is connected!';
      result = await sendWhatsAppMessage(phone, text, req, { bypassEnabledCheck: true });
    }

    res.json({
      ok: true,
      message: tName && tName !== 'none' && tName !== 'custom_text'
        ? `Meta accepted template "${tName}". Check delivery status for confirmation.`
        : 'Meta accepted the text request. Check delivery status for confirmation; freeform text requires an open customer service window.',
      templateUsed: tName,
      result
    });
  } catch (err) {
    console.error('whatsapp test send error:', err);
    const metaErr = err.response?.data?.error;
    const errMsg = metaErr?.message || err.message || 'Failed to dispatch test WhatsApp message';
    res.status(500).json({ error: errMsg });
  }
});

// POST /api/whatsapp/send
// Direct outbound WhatsApp message dispatch
router.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }
    const result = await sendWhatsAppMessage(phone, message, req);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('whatsapp send error:', err);
    const metaErr = err.response?.data?.error;
    const errMsg = metaErr?.message || err.message || 'Failed to dispatch message';
    res.status(500).json({ error: errMsg });
  }
});

// POST /api/whatsapp/send-voucher-receipt
// Send rendered voucher slip / image to driver or truck owner
router.post('/send-voucher-receipt', async (req, res) => {
  try {
    const { voucher, imageDataUrl, phone: directPhone } = req.body;
    if (!voucher && !imageDataUrl) {
      return res.status(400).json({ error: 'Voucher and imageDataUrl are required' });
    }

    let targetPhone = directPhone;
    if (!targetPhone && voucher) {
      targetPhone = voucher.driverContact || voucher.ownerContact || voucher.phone;
      if (!targetPhone && voucher.truckNo) {
        targetPhone = await lookupVehiclePhone(voucher.truckNo, req);
      }
    }

    if (!targetPhone) {
      return res.status(400).json({ error: 'Could not find a recipient phone number for voucher' });
    }

    let imageBuffer = null;
    if (imageDataUrl && imageDataUrl.startsWith('data:image')) {
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else if (voucher) {
      imageBuffer = await generateVoucherImageBuffer(voucher);
    }

    const caption = `📋 *Freight Voucher #${voucher?.voucherNo || ''}*\n🚚 *Truck:* ${voucher?.truckNo || ''}\n📍 *Route:* ${voucher?.destination || ''}\n💰 *Net Balance:* ₹${voucher?.netBalance || 0}\nVIKAS GOODS TRANSPORT CO.`;

    if (imageBuffer) {
      const result = await sendWhatsAppImage(targetPhone, imageBuffer, caption, req);
      return res.json({ ok: true, status: 'sent', result });
    } else {
      const result = await sendWhatsAppMessage(targetPhone, caption, req);
      return res.json({ ok: true, status: 'sent', result });
    }
  } catch (err) {
    console.error('send-voucher-receipt error:', err);
    const metaErr = err.response?.data?.error;
    const errMsg = metaErr?.message || err.message || 'Failed to send voucher receipt';
    res.status(500).json({ error: errMsg });
  }
});


// POST /api/whatsapp/send-salary-settlement
router.post('/send-salary-settlement', async (req, res) => {
  try {
    const { phone, settlementData } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }

    const tplData = {
      staffName: settlementData.profileName || 'Staff',
      staffType: settlementData.profileType || 'Staff',
      month: settlementData.month || '',
      vehicleLine: settlementData.vehicleNo ? `🚚 *Truck:* ${settlementData.vehicleNo}` : '',
      daysInMonth: settlementData.daysInMonth || 0,
      presentDays: settlementData.presentDays || 0,
      absentDays: (settlementData.absentDays || 0) + (settlementData.leaveDays || 0),
      deductedDays: settlementData.deductedDays || 0,
      baseSalary: settlementData.baseSalary || 0,
      attendanceDeductions: settlementData.attendanceDeductions || 0,
      allowanceLine: settlementData.extraAllowance > 0 ? `• Allowance / Bonus: +Rs.${settlementData.extraAllowance}` : '',
      penaltyLine: settlementData.otherDeduction > 0 ? `• Fine / Penalty: -Rs.${settlementData.otherDeduction}` : '',
      adjustedSalary: settlementData.adjustedSalary || 0,
      payoutAmount: settlementData.payoutAmount || 0,
      paymentMethod: settlementData.paymentMethod || 'Cash',
      payoutDate: settlementData.payoutDate || new Date().toISOString().slice(0, 10),
    };

    await sendEventNotification('staff_salary_settlement', tplData, [phone], req);
    res.json({ ok: true });
  } catch (err) {
    console.error('whatsapp salary settlement send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/preview/:eventKey
// Returns a sample interpolated message for the given event key.
// Used by the Control Module to preview templates without sending.
router.get('/preview/:eventKey', async (req, res) => {
  try {
    const { eventKey } = req.params;
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
