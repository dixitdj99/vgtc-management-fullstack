/**
 * whatsappService.js
 *
 * Handles all WhatsApp notification dispatch for VGTC Management System.
 * Supports rich text templates (with emoji + bold/italic formatting) for all
 * key business events, and image-type receipt cards for LR and Voucher events
 * sent via OpenWA gateway.
 *
 * Events supported:
 *  - lr_created_owner    → truck owner (market vehicles only)
 *  - lr_created_driver   → truck driver (all vehicles)
 *  - voucher_created_owner → truck owner (market vehicles only)
 *  - voucher_created_driver → truck driver (all vehicles)
 *  - balance_paid        → truck owner phone
 *  - cashout             → admin phone
 *  - deposit             → admin phone
 */

const axios = require('axios');
const { db, isAvailable } = require('../firebase');
const { getCol } = require('./collectionUtils');
const localStore = require('./localStore');

const CONFIG_COL = 'whatsapp_config';
const CONFIG_DOC_ID = 'gateway';

// Hardcoded admin number — always receives deposit/cashout alerts
const HARDCODED_ADMIN = '8708032492';

// ─── Default event templates ───────────────────────────────────────────────────
// Placeholders use {fieldName} syntax — all resolved by interpolateTemplate().
const DEFAULT_TEMPLATES = {
  // Owner message for market vehicles (receives freight & payment details)
  lr_created_owner: {
    enabled: true,
    template: [
      '🚛 *VGTC Loading Receipt — Owner Copy*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '📋 *LR No:* #{lrNo}',
      '📅 *Date:* {date}',
      '🚚 *Truck:* {truckNo}',
      '📍 *Route:* {source} → {destination}',
      '🏭 *Party:* {partyName}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '📦 *Material:*',
      '{materialsText}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '⚖️ *Total Weight:* {totalWeight} MT  🛒 *Bags:* {totalBags}',
      '💰 *Freight Rate:* ₹{freight}/MT',
      '💵 *Total Freight:* ₹{totalFreight}',
      '🔖 *Billing:* {billing}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '_VIKAS GOODS TRANSPORT CO. | 9416319445_'
    ].join('\n')
  },
  // Driver message (trip dispatch confirmation, no financial details)
  lr_created_driver: {
    enabled: true,
    template: [
      '🚚 *Trip Dispatched — Driver Alert*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '📋 *LR No:* #{lrNo}',
      '📅 *Date:* {date}',
      '🚚 *Your Truck:* {truckNo}',
      '📍 *Destination:* {destination}',
      '🏭 *Party:* {partyName}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '📦 *Load:* {totalBags} Bags ({totalWeight} MT)',
      '🔖 *Billing Type:* {billing}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '⚠️ Please carry all documents. Drive safe!',
      '_VIKAS GOODS TRANSPORT CO. | 9416319445_'
    ].join('\n')
  },
  // Owner voucher message (full deduction breakdown)
  voucher_created_owner: {
    enabled: true,
    template: [
      '📄 *VGTC Freight Voucher — Owner Copy*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '📋 *Voucher:* #{voucherNo}  🔗 *LR:* #{lrNo}',
      '📅 *Date:* {date}',
      '🚚 *Truck:* {truckNo}',
      '📍 *Route:* {destination}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '💰 *Gross Freight:* ₹{grossFreight}',
      '➖ Diesel Advance: ₹{advanceDiesel}',
      '➖ Cash Advance: ₹{advanceCash}',
      '➖ Online Advance: ₹{advanceOnline}',
      '➖ Munshi: ₹{munshi}',
      '➖ Commission: ₹{commission}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '✅ *Net Balance Due:* ₹{netBalance}',
      '📊 *Status:* {paymentStatus}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '_VIKAS GOODS TRANSPORT CO. | 9416319445_'
    ].join('\n')
  },
  // Driver voucher message (just their settlement amount)
  voucher_created_driver: {
    enabled: true,
    template: [
      '💰 *Your Trip Settlement — Driver Alert*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '📋 *Voucher:* #{voucherNo}  🔗 *LR:* #{lrNo}',
      '📅 *Date:* {date}',
      '🚚 *Truck:* {truckNo}',
      '📍 *Route:* {destination}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '➖ Diesel Advance: ₹{advanceDiesel}',
      '➖ Cash Advance: ₹{advanceCash}',
      '➖ Munshi: ₹{munshi}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '✅ *Balance remaining for you:* ₹{netBalance}',
      '📊 *Payment Status:* {paymentStatus}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '_VIKAS GOODS TRANSPORT CO. | 9416319445_'
    ].join('\n')
  },
  balance_paid: {
    enabled: true,
    template: [
      '💸 *VGTC Balance Payment Dispatched*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '🚚 *Truck:* {truckNo}',
      '📋 *Trips Included:* {tripCount}',
      '📅 *Period:* {periodFrom} – {periodTo}',
      '📦 *Batch Note:* {note}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '✅ Payment batch sent for processing.',
      '_Contact VGTC for clearance: 9416319445_'
    ].join('\n')
  },
  cashout: {
    enabled: true,
    template: [
      '💵 *VGTC Cash Out Alert*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '👤 *Recipient:* {entityName}',
      '🏷️ *Type:* {entityType}',
      '💰 *Amount:* ₹{amount}',
      '📝 *Remark:* {remark}',
      '📅 *Date:* {date}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '_VIKAS GOODS TRANSPORT CO._',
      '_This is an automated cashbook alert._'
    ].join('\n')
  },
  deposit: {
    enabled: true,
    template: [
      '💰 *VGTC Deposit Received*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '💵 *Amount:* ₹{amount}',
      '📝 *Remark:* {remark}',
      '📅 *Date:* {date}',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '✅ Amount credited to cashbook.',
      '_VIKAS GOODS TRANSPORT CO._',
      '_This is an automated cashbook alert._'
    ].join('\n')
  }
};

// ─── Config CRUD ───────────────────────────────────────────────────────────────

async function getWhatsAppConfig(req = null) {
  try {
    let cfg = null;
    if (!isAvailable()) {
      cfg = localStore.getById(CONFIG_COL, CONFIG_DOC_ID);
    } else {
      const colName = req ? getCol(CONFIG_COL, req) : CONFIG_COL;
      const doc = await db.collection(colName).doc(CONFIG_DOC_ID).get();
      if (doc.exists) cfg = doc.data();
    }
    const finalCfg = cfg || {};
    return {
      enabled: finalCfg.enabled !== undefined ? finalCfg.enabled : true,
      gatewayUrl: (finalCfg.gatewayUrl || '').trim().replace(/\/+$/, ''),
      apiKey: (finalCfg.apiKey || '').trim(),
      adminPhone: finalCfg.adminPhone || HARDCODED_ADMIN,
      payloadFormat: 'openwa',
      events: { ...DEFAULT_TEMPLATES, ...(finalCfg.events || {}) }
    };
  } catch (e) {
    return { enabled: false, gatewayUrl: '', apiKey: '', adminPhone: HARDCODED_ADMIN, payloadFormat: 'openwa', events: DEFAULT_TEMPLATES };
  }
}

async function saveWhatsAppConfig(config, req = null) {
  const payload = {
    ...config,
    gatewayUrl: (config.gatewayUrl || '').trim().replace(/\/+$/, ''),
    apiKey: (config.apiKey || '').trim(),
    payloadFormat: 'openwa',
    updatedAt: new Date().toISOString()
  };
  if (!isAvailable()) {
    localStore.upsert(CONFIG_COL, CONFIG_DOC_ID, payload);
  } else {
    const colName = req ? getCol(CONFIG_COL, req) : CONFIG_COL;
    await db.collection(colName).doc(CONFIG_DOC_ID).set(payload, { merge: true });
  }
  return payload;
}

// ─── OpenWA Helper Utilities ───────────────────────────────────────────────────

function getOpenWaHeaders(apiKey) {
  const cleanKey = (apiKey || '').trim();
  const headers = { 'Content-Type': 'application/json' };
  if (cleanKey) {
    headers['api_key'] = cleanKey;
    headers['api-key'] = cleanKey;
    headers['x-api-key'] = cleanKey;
    headers['Authorization'] = `Bearer ${cleanKey}`;
  }
  return headers;
}

function buildOpenWaUrl(baseUrl, endpointPath, apiKey) {
  const cleanUrl = (baseUrl || '').trim().replace(/\/+$/, '');
  const cleanKey = (apiKey || '').trim();
  if (cleanKey) {
    const sep = endpointPath.includes('?') ? '&' : '?';
    return `${cleanUrl}${endpointPath}${sep}api_key=${encodeURIComponent(cleanKey)}`;
  }
  return `${cleanUrl}${endpointPath}`;
}

// ─── Phone normalisation ───────────────────────────────────────────────────────

function formatPhoneWid(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  if (!cleaned.endsWith('@c.us') && !cleaned.endsWith('@g.us')) {
    cleaned = cleaned + '@c.us';
  }
  return cleaned;
}

// ─── Status check ─────────────────────────────────────────────────────────────

async function checkWhatsAppStatus(req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.gatewayUrl) {
    return { connected: false, message: 'Gateway URL not configured' };
  }

  const baseUrl = (config.gatewayUrl || '').trim().replace(/\/+$/, '');
  const apiKey = (config.apiKey || '').trim();
  const headers = getOpenWaHeaders(apiKey);

  const checkEndpoints = [
    '/api/health/ready',
    '/check-auth',
    '/getMe',
    '/api/sessions',
    '/ping',
    ''
  ];

  let isUnauthorized = false;
  let lastErrMessage = '';

  for (const ep of checkEndpoints) {
    try {
      const url = buildOpenWaUrl(baseUrl, ep, apiKey);
      const res = await axios.get(url, { headers, timeout: 5000 });
      if (res.status >= 200 && res.status < 300) {
        return { connected: true, message: 'OpenWA Gateway Online & Authenticated' };
      }
    } catch (err) {
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        isUnauthorized = true;
        lastErrMessage = err.response.data?.message || err.response.data?.error || 'Invalid API Key';
      } else {
        lastErrMessage = err.message || 'Gateway Unreachable';
      }
    }
  }

  if (isUnauthorized) {
    return { connected: false, message: `Invalid API Key — OpenWA Authentication Failed: ${lastErrMessage}` };
  }

  return { connected: false, message: `Gateway Unreachable: ${lastErrMessage}` };
}

// ─── Template interpolation ────────────────────────────────────────────────────

/**
 * Replaces {key} placeholders in a template string with values from `data`.
 * Unknown keys are left as empty strings so the message is never broken.
 */
function interpolateTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
}

// ─── Vehicle info lookup ───────────────────────────────────────────────────────

/**
 * Fetches the full vehicle record for a given truckNo.
 * Returns { ownerContact, driverContact, ownershipType, ownerName, driverName }
 * or null if not found.
 */
async function lookupVehicleInfo(truckNo, req) {
  if (!truckNo) return null;
  try {
    const colName = getCol('vehicles', req);
    let vehicles = [];
    if (!isAvailable()) {
      vehicles = localStore.getAll('vehicles').filter(
        v => String(v.truckNo || '').toUpperCase() === String(truckNo).toUpperCase()
      );
    } else {
      const snap = await db.collection(colName)
        .where('orgId', '==', req.orgId)
        .where('truckNo', '==', String(truckNo).toUpperCase())
        .limit(1)
        .get();
      vehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const v = vehicles[0];
    if (!v) return null;
    return {
      ownerContact:   v.ownerContact   || '',
      driverContact:  v.driverContact  || '',
      ownershipType:  v.ownershipType  || 'market',   // 'self' | 'market'
      ownerName:      v.ownerName      || '',
      driverName:     v.driverName     || '',
    };
  } catch (e) {
    console.error('[WA] lookupVehicleInfo error:', e.message);
    return null;
  }
}

/**
 * Legacy helper — kept for backward compat with freightBatchRoutes.
 * Returns only the first available phone (ownerContact > driverContact).
 */
async function lookupVehiclePhone(truckNo, req) {
  const info = await lookupVehicleInfo(truckNo, req);
  if (!info) return null;
  return info.ownerContact || info.driverContact || null;
}

// ─── Core send ────────────────────────────────────────────────────────────────

async function sendWhatsAppMessage(phone, message, req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled) {
    throw new Error('WhatsApp dispatch is disabled in Control Module settings');
  }
  if (!config.gatewayUrl) {
    throw new Error('WhatsApp Gateway URL is not configured');
  }

  const baseUrl = (config.gatewayUrl || '').trim().replace(/\/+$/, '');
  const apiKey = (config.apiKey || '').trim();
  const chatId = formatPhoneWid(phone);

  if (!chatId) {
    throw new Error('Invalid phone number provided for WhatsApp dispatch');
  }

  const headers = getOpenWaHeaders(apiKey);

  const attempts = [
    {
      endpoint: '/api/ingress/whatsapp-web.js/default/sendText',
      payload: { api_key: apiKey, to: chatId, content: message, text: message, args: { to: chatId, content: message } }
    },
    {
      endpoint: '/api/ingress/whatsapp-web.js/default/sendMessage',
      payload: { api_key: apiKey, to: chatId, content: message, text: message, args: { to: chatId, content: message } }
    },
    {
      endpoint: '/api/ingress/whatsapp-web.js/default/messages/send-text',
      payload: { api_key: apiKey, chatId: chatId, text: message, to: chatId, message: message }
    },
    {
      endpoint: '/api/sessions/default/messages/send-text',
      payload: { api_key: apiKey, chatId: chatId, text: message, to: chatId, message: message }
    },
    {
      endpoint: '/api/messages/send-text',
      payload: { api_key: apiKey, chatId: chatId, text: message, to: chatId, message: message }
    },
    {
      endpoint: '/api/sendText',
      payload: { api_key: apiKey, to: chatId, content: message, args: { to: chatId, content: message } }
    },
    {
      endpoint: '/sendText',
      payload: { api_key: apiKey, to: chatId, content: message, args: { to: chatId, content: message } }
    }
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const url = buildOpenWaUrl(baseUrl, attempt.endpoint, apiKey);
      const res = await axios.post(url, attempt.payload, { headers, timeout: 30000 });
      if (res.status >= 200 && res.status < 300) {
        return res.data;
      }
    } catch (err) {
      lastError = err;
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        const errMsg = err.response.data?.message || err.response.data?.error || 'Invalid API Key';
        throw new Error(`OpenWA Authentication Failed: ${errMsg} (Status 401/403)`);
      }

      // Check if OpenWA requires session startup
      const errText = String(err.response?.data?.message || err.response?.data?.error || err.message || '');
      if (errText.includes('is not active') || errText.includes('Start the session first')) {
        console.log('[WA] Session inactive detected — attempting auto-start trigger on OpenWA...');
        try {
          const startUrl = buildOpenWaUrl(baseUrl, '/api/sessions/default/start', apiKey);
          await axios.post(startUrl, { api_key: apiKey }, { headers, timeout: 15000 });
        } catch (startErr) {
          try {
            const startUrl2 = buildOpenWaUrl(baseUrl, '/api/sessions/start', apiKey);
            await axios.post(startUrl2, { api_key: apiKey }, { headers, timeout: 15000 });
          } catch (e) { /* ignore fallback start error */ }
        }
      }
    }
  }

  // Final retry after auto session start attempt if session inactive was encountered
  const errText = String(lastError?.response?.data?.message || lastError?.response?.data?.error || lastError?.message || '');
  if (errText.includes('is not active') || errText.includes('Start the session first')) {
    try {
      const retryUrl = buildOpenWaUrl(baseUrl, '/sendText', apiKey);
      const res = await axios.post(retryUrl, { api_key: apiKey, to: chatId, content: message, args: { to: chatId, content: message } }, { headers, timeout: 30000 });
      if (res.status >= 200 && res.status < 300) return res.data;
    } catch (retryErr) {
      lastError = retryErr;
    }
  }

  if (lastError?.code === 'ECONNABORTED' || String(lastError?.message).includes('timeout')) {
    throw new Error('OpenWA Gateway timed out (30s) — Ensure session QR is scanned & active in OpenWA dashboard');
  }

  const msg = lastError?.response?.data?.message || lastError?.response?.data?.error || lastError?.message || 'Failed to dispatch message via OpenWA';
  throw new Error(msg);
}

// ─── Event notification dispatcher ────────────────────────────────────────────

/**
 * High-level helper — resolves the template for `eventKey`, interpolates
 * `data`, and sends to every phone in `phones`. Silently skips empty phones.
 * Never throws (fire-and-forget safe).
 *
 * @param {string}   eventKey  One of: lr_created|voucher_created|balance_paid|cashout|deposit
 * @param {object}   data      Placeholder values for template interpolation
 * @param {string[]} phones    Array of phone numbers to send to
 * @param {object}   req       Express request (for org context)
 */
async function sendEventNotification(eventKey, data, phones, req) {
  try {
    const config = await getWhatsAppConfig(req);
    if (!config.enabled || !config.gatewayUrl) return;

    const eventCfg = (config.events || {})[eventKey] || DEFAULT_TEMPLATES[eventKey];
    if (!eventCfg || eventCfg.enabled === false) return;

    const template = eventCfg.template || '';
    const message = interpolateTemplate(template, data);

    const validPhones = (phones || []).filter(p => p && String(p).trim());
    if (!validPhones.length) {
      console.log(`[WA] ${eventKey}: no valid recipient phones — skipping`);
      return;
    }

    for (const phone of validPhones) {
      try {
        await sendWhatsAppMessage(phone, message, req);
        console.log(`[WA] ${eventKey} → ${phone}: sent`);
      } catch (e) {
        console.error(`[WA] ${eventKey} → ${phone}: FAILED —`, e.message);
      }
    }
  } catch (e) {
    console.error(`[WA] sendEventNotification(${eventKey}): FAILED —`, e.message);
  }
}

// ─── Receipt HTML generator ────────────────────────────────────────────────────

/**
 * Generates a styled HTML string for an LR receipt that can be sent as a file
 * or displayed in a preview panel. Matches the browser print receipt layout.
 */
function generateLrReceiptHtml(lr) {
  const materials = Array.isArray(lr.materials) && lr.materials.length > 0
    ? lr.materials
    : [{ type: lr.material || 'Cement', bags: lr.bags || 0, weight: lr.weight || 0 }];

  const totalBags = materials.reduce((s, m) => s + (parseInt(m.bags) || 0), 0);
  const totalWeight = materials.reduce((s, m) => s + (parseFloat(m.weight) || 0), 0);

  const materialsRows = materials.map(m => `
    <tr>
      <td>${m.type || 'Cement'}</td>
      <td style="text-align:center">${m.bags || 0}</td>
      <td style="text-align:center">${parseFloat(m.weight || 0).toFixed(2)} MT</td>
    </tr>
  `).join('');

  const freight = parseFloat(lr.freight || 0);
  const totalFreight = freight * totalWeight;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #fff; width: 800px; padding: 20px; }
  .receipt { border: 2px solid #1e293b; border-radius: 8px; overflow: hidden; }
  .header { background: #1e293b; color: white; padding: 16px 20px; text-align: center; }
  .header h1 { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
  .header p { font-size: 11px; margin-top: 4px; color: #94a3b8; }
  .badge { background: #f59e0b; color: #1e293b; display: inline-block; padding: 3px 14px; border-radius: 20px; font-size: 11px; font-weight: bold; margin-top: 6px; }
  .body { padding: 16px 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .field label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .field .val { font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 2px; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 11px; color: #475569; text-transform: uppercase; }
  td { padding: 6px 8px; border-top: 1px solid #e2e8f0; color: #1e293b; }
  .totals { background: #1e293b; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
  .totals .label { font-size: 12px; color: #94a3b8; }
  .totals .amount { font-size: 22px; font-weight: bold; }
  .totals .bags-info { font-size: 12px; color: #f59e0b; margin-top: 2px; }
  .footer { background: #f8fafc; padding: 8px 20px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <h1>VIKAS GOODS TRANSPORT CO.</h1>
    <p>Near Gaushala, Rewari Road, Jhajjar (Hr.) | GSTIN: 06ARIPK9021C2Z2</p>
    <span class="badge">LOADING RECEIPT</span>
  </div>
  <div class="body">
    <div class="grid">
      <div class="field">
        <label>LR Number</label>
        <div class="val">#${lr.lrNo || lr.id || 'N/A'}</div>
      </div>
      <div class="field">
        <label>Date</label>
        <div class="val">${lr.date || '—'}</div>
      </div>
      <div class="field">
        <label>Truck Number</label>
        <div class="val">${lr.truckNo || '—'}</div>
      </div>
      <div class="field">
        <label>Destination</label>
        <div class="val">${lr.destination || '—'}</div>
      </div>
      <div class="field">
        <label>Party Name</label>
        <div class="val">${lr.partyName || '—'}</div>
      </div>
      <div class="field">
        <label>Billing</label>
        <div class="val">${lr.billing || '—'}</div>
      </div>
    </div>
    <hr class="divider">
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th style="text-align:center">Bags</th>
          <th style="text-align:center">Weight (MT)</th>
        </tr>
      </thead>
      <tbody>
        ${materialsRows}
      </tbody>
      <tfoot>
        <tr style="font-weight:bold; background:#f8fafc">
          <td>Total</td>
          <td style="text-align:center">${totalBags}</td>
          <td style="text-align:center">${totalWeight.toFixed(2)} MT</td>
        </tr>
      </tfoot>
    </table>
    ${lr.remark ? `<p style="font-size:12px;color:#64748b;margin-top:10px">📝 Remark: ${lr.remark}</p>` : ''}
  </div>
  <div class="totals">
    <div>
      <div class="label">Freight Rate</div>
      <div class="amount">₹${freight}/MT</div>
      <div class="bags-info">${totalBags} Bags | ${totalWeight.toFixed(2)} MT</div>
    </div>
    <div style="text-align:right">
      <div class="label">Total Freight</div>
      <div class="amount">₹${totalFreight.toFixed(0)}</div>
    </div>
  </div>
  <div class="footer">LR ID: ${lr.id || 'N/A'} | Generated: ${new Date().toLocaleString('en-IN')} | VGTC Management System</div>
</div>
</body>
</html>`;
}

/**
 * Generates a styled HTML string for a Voucher/Freight slip.
 */
function generateVoucherHtml(v) {
  const gross = v.deliveries?.length > 0
    ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
    : (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);

  const diesel = parseFloat(v.advanceDiesel) || 0;
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const weight = parseFloat(v.weight) || 0;
  const munshi = parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
  const shortage = parseFloat(v.shortage) || 0;
  const commission = parseFloat(v.commission) || 0;
  const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
  const tyreGreasing = (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0);
  const totalDeductions = diesel + cash + online + munshi + shortage + commission + tyrePuncture + tyreGreasing;
  const net = gross - totalDeductions;

  const deductRows = [
    ['Diesel Advance', diesel],
    ['Cash Advance', cash],
    ['Online Advance', online],
    ['Munshi', munshi],
    ['Shortage', shortage],
    ['Commission', commission],
    ['Tyre Puncture', tyrePuncture],
    ['Tyre Greasing & Air', tyreGreasing],
  ].filter(([, val]) => val > 0).map(([label, val]) => `
    <tr>
      <td>${label}</td>
      <td style="text-align:right;color:#dc2626">- ₹${val.toFixed(0)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #fff; width: 800px; padding: 20px; }
  .receipt { border: 2px solid #1e293b; border-radius: 8px; overflow: hidden; }
  .header { background: #1e293b; color: white; padding: 16px 20px; text-align: center; }
  .header h1 { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
  .header p { font-size: 11px; margin-top: 4px; color: #94a3b8; }
  .badge { background: #22c55e; color: white; display: inline-block; padding: 3px 14px; border-radius: 20px; font-size: 11px; font-weight: bold; margin-top: 6px; }
  .body { padding: 16px 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .field label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .field .val { font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 2px; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 11px; color: #475569; text-transform: uppercase; }
  td { padding: 6px 8px; border-top: 1px solid #e2e8f0; color: #1e293b; }
  .gross-row { background: #f0fdf4; font-weight: bold; color: #16a34a; }
  .net-row { background: #1e293b; color: white; font-weight: bold; font-size: 16px; }
  .net-row td { padding: 10px 8px; }
  .footer { background: #f8fafc; padding: 8px 20px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <h1>VIKAS GOODS TRANSPORT CO.</h1>
    <p>Near Gaushala, Rewari Road, Jhajjar (Hr.) | GSTIN: 06ARIPK9021C2Z2</p>
    <span class="badge">FREIGHT VOUCHER</span>
  </div>
  <div class="body">
    <div class="grid">
      <div class="field">
        <label>Voucher No</label>
        <div class="val">#${v.voucherNo || v.id || 'N/A'}</div>
      </div>
      <div class="field">
        <label>LR No</label>
        <div class="val">#${v.lrNo || '—'}</div>
      </div>
      <div class="field">
        <label>Date</label>
        <div class="val">${v.date || '—'}</div>
      </div>
      <div class="field">
        <label>Truck No</label>
        <div class="val">${v.truckNo || '—'}</div>
      </div>
      <div class="field">
        <label>Driver</label>
        <div class="val">${v.driverName || '—'}</div>
      </div>
      <div class="field">
        <label>Route</label>
        <div class="val">${v.destination || '—'}</div>
      </div>
    </div>
    <hr class="divider">
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr class="gross-row">
          <td>Gross Freight (${v.weight || 0} MT × ₹${v.rate || 0})</td>
          <td style="text-align:right">+ ₹${gross.toFixed(0)}</td>
        </tr>
        ${deductRows}
        <tr class="net-row">
          <td>NET BALANCE DUE</td>
          <td style="text-align:right">₹${net.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="footer">Voucher ID: ${v.id || 'N/A'} | Generated: ${new Date().toLocaleString('en-IN')} | VGTC Management System</div>
</div>
</body>
</html>`;
}

// ─── Template preview ──────────────────────────────────────────────────────────

/**
 * Returns a filled-in preview of a template using sample data.
 * Used by the admin preview endpoint.
 */
function previewTemplate(eventKey, config) {
  const sampleData = {
    lrNo: '1042',
    voucherNo: '501',
    date: new Date().toLocaleDateString('en-IN'),
    truckNo: 'HR55AA1234',
    destination: 'Rewari',
    source: 'Jhajjar',
    partyName: 'M/S Sample Traders',
    materialsText: '• Cement: 300 Bags (18 MT)',
    totalWeight: '18',
    totalBags: '300',
    freight: '5500',
    totalFreight: '99000',
    billing: 'To Pay',
    remark: 'Sample remark',
    driverName: 'Ramesh Kumar',
    grossFreight: '99000',
    advanceDiesel: '5000',
    advanceCash: '2000',
    advanceOnline: '0',
    munshi: '100',
    commission: '0',
    netBalance: '91900',
    paymentStatus: 'Balance Pending',
    tripCount: '3',
    totalAmount: '91900',
    periodFrom: '01/09/2026',
    periodTo: '10/09/2026',
    note: 'Monthly settlement',
    entityName: 'Ramesh Kumar',
    entityType: 'Driver',
    amount: '5000',
  };

  const eventCfg = (config.events || {})[eventKey] || DEFAULT_TEMPLATES[eventKey];
  if (!eventCfg) return `Unknown event: ${eventKey}`;
  return interpolateTemplate(eventCfg.template || '', sampleData);
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  checkWhatsAppStatus,
  sendWhatsAppMessage,
  sendEventNotification,
  generateLrReceiptHtml,
  generateVoucherHtml,
  previewTemplate,
  lookupVehiclePhone,
  lookupVehicleInfo,
  formatPhoneWid,
  DEFAULT_TEMPLATES
};
