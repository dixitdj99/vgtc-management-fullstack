/**
 * whatsappService.js
 *
 * Handles all WhatsApp notification dispatch for VGTC Management System.
 * Supports rich text templates (with emoji + bold/italic formatting) for all
 * key business events, and image-type receipt cards for LR and Voucher events
 * sent via OpenWA gateway.
 *
 * Events supported:
 *  - lr_created_owner          → truck owner (market vehicles only)
 *  - lr_created_driver         → truck driver (all vehicles)
 *  - voucher_created_owner     → truck owner (market vehicles only)
 *  - voucher_created_driver    → truck driver (all vehicles)
 *  - online_advance_clerk      → admin/clerk when online advance voucher created
 *  - online_advance_paid_owner → truck owner when advance marked paid via webhook
 *  - online_advance_paid_driver→ truck driver when advance marked paid via webhook
 *  - balance_paid              → truck owner phone
 *  - cashout                   → admin phone
 *  - deposit                   → admin phone
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const { db, isAvailable } = require('../firebase');
const { getCol, getEnvCol } = require('./collectionUtils');
const localStore = require('./localStore');

// Register system Hindi / Devanagari fonts so Hindi text renders properly on canvas
['C:/Windows/Fonts/Nirmala.ttf', 'C:/Windows/Fonts/mangal.ttf', 'C:/Windows/Fonts/aparaj.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].forEach(p => {
  if (fs.existsSync(p)) {
    try { GlobalFonts.registerFromPath(p); } catch (_) {}
  }
});

const FONT_FAMILY = 'Nirmala UI, Mangal, Aparajita, Arial, sans-serif';

// Preload VGTC logo for canvas slips (prioritize full vgtc-logo.png)
let preloadedLogoMark = null;
(async () => {
  try {
    const logoPaths = [
      path.resolve(__dirname, '../../client/public/vgtc-logo.png'),
      path.resolve(__dirname, '../client/public/vgtc-logo.png'),
      path.resolve(__dirname, '../public/vgtc-logo.png'),
      path.resolve(process.cwd(), 'client/public/vgtc-logo.png'),
      path.resolve(__dirname, '../../client/public/vgtc-mark.png'),
    ];
    for (const p of logoPaths) {
      if (fs.existsSync(p)) {
        preloadedLogoMark = await loadImage(p);
        break;
      }
    }
  } catch (err) {
    console.warn('[WA-Canvas] Logo load notice:', err.message);
  }
})();

function formatSlipDate(rawDate) {
  if (!rawDate) {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
  if (typeof rawDate === 'string' && rawDate.includes('/')) {
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      const d = String(parts[0]).padStart(2, '0');
      const m = String(parts[1]).padStart(2, '0');
      const y = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
      return `${d}-${m}-${y}`;
    }
  }
  if (typeof rawDate === 'string' && rawDate.includes('-')) {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${String(parts[2]).slice(0, 2).padStart(2, '0')}-${String(parts[1]).padStart(2, '0')}-${parts[0]}`;
      }
      return rawDate;
    }
  }
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch (_) {}
  return String(rawDate);
}

const CONFIG_COL = 'whatsapp_config';
const CONFIG_DOC_ID = 'gateway';

// Hardcoded admin number — always receives deposit/cashout alerts
const HARDCODED_ADMIN = '8708032492';
const DEFAULT_LABOUR_PHONE = '8708032492';
const BOT_SENDER_PHONE = '919996806953';

// ─── WhatsApp Activity & Webhook Logs Store ──────────────────────────────────
const LOGS_FILE = path.resolve(__dirname, '../data/whatsapp_logs.json');
let inMemoryLogs = [];

try {
  if (fs.existsSync(LOGS_FILE)) {
    inMemoryLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    if (!Array.isArray(inMemoryLogs)) inMemoryLogs = [];
  }
} catch (e) {
  inMemoryLogs = [];
}

function logWhatsAppActivity({ type = 'outbound', category = 'general', phone = '', recipient = '', status = 'sent', title = '', details = '', error = null }) {
  try {
    const entry = {
      id: `walog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      type, // 'outbound' | 'inbound_webhook'
      category: category || 'general',
      phone: phone || recipient || '',
      status: status || 'sent', // 'sent' | 'failed' | 'received'
      title: title || `${category} event`,
      details: typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
      error: error ? String(error) : null
    };
    inMemoryLogs.unshift(entry);
    if (inMemoryLogs.length > 250) inMemoryLogs = inMemoryLogs.slice(0, 250);

    try {
      const dir = path.dirname(LOGS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(LOGS_FILE, JSON.stringify(inMemoryLogs, null, 2), 'utf8');
    } catch (_) {}
    return entry;
  } catch (err) {
    console.warn('[WA-Log] Error writing log:', err.message);
  }
}

function getWhatsAppLogs(limit = 100) {
  return inMemoryLogs.slice(0, limit);
}

function clearWhatsAppLogs() {
  inMemoryLogs = [];
  try {
    if (fs.existsSync(LOGS_FILE)) fs.writeFileSync(LOGS_FILE, JSON.stringify([]), 'utf8');
  } catch (_) {}
  return true;
}

// ─── Default event templates ───────────────────────────────────────────────────
// Placeholders use {fieldName} syntax — all resolved by interpolateTemplate().
const DEFAULT_TEMPLATES = {
  // Owner message for loading receipt / bill copy
  lr_created_owner: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*📋 Loading Receipt — Owner Copy*',
      '*LR #:* {lrNo} | *Token #:* {loadingNo} | *Date:* {date}',
      '*Truck:* {truckNo} | *Party:* {partyName}',
      '*Route:* {source} → {destination} ({loadingType})',
      '*Material:* {materialsText}',
      '*Total:* {totalWeight} MT ({totalBags} Bags)'
    ].join('\n')
  },
  // Driver message: Loading Order / Slip issued (wait for turn)
  lr_created_driver: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*🚚 Driver Loading Slip*',
      '*Token #{loadingNo}* (Today\'s Turn) | *LR #:* {lrNo}',
      '*Truck:* {truckNo} | *Date:* {date}',
      '*Loading:* {source} → *To:* {destination}',
      '*Load:* {materialsText} ({totalWeight} MT / {totalBags} Bags)',
      '👉 Please park at {source} loading area & wait for Token #{loadingNo}.'
    ].join('\n')
  },
  // Labour Team alert to load vehicles queue number-wise
  lr_loading_labour: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*📦 Labour Loading Queue*',
      '*Token #{loadingNo}* | *LR #{lrNo}* | *Truck:* {truckNo}',
      '*From:* {source} → *To:* {destination}',
      '*Party:* {partyName} | *Type:* {loadingType}',
      '*Material:* {materialsText} | *Total:* {totalWeight} MT ({totalBags} Bags)'
    ].join('\n')
  },
  // Notification to creator when labour marks vehicle loaded
  lr_loaded_creator: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*✅ Vehicle Loading Completed*',
      '*Token #{loadingNo}* | *LR #{lrNo}* | *Truck:* {truckNo}',
      '*Route:* {source} → {destination} | *Party:* {partyName}',
      'Labour confirmed loading. Ready for voucher & dispatch.'
    ].join('\n')
  },
  // Owner voucher message (full deduction breakdown)
  voucher_created_owner: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*📋 Freight Voucher — Owner Copy*',
      '*Voucher:* #{voucherNo} | *LR:* #{lrNo} | *Date:* {date}',
      '*Truck:* {truckNo} | *Route:* {destination}',
      '*Gross:* Rs.{grossFreight} | *Net Due:* *Rs.{netBalance}*',
      'Advances: Diesel: Rs.{advanceDiesel}, Cash: Rs.{advanceCash}, Online: Rs.{advanceOnline}',
      'Deductions: Munshi: Rs.{munshi}, Comm: Rs.{commission}',
      '*Status:* {paymentStatus}'
    ].join('\n')
  },
  // Driver voucher message: Vehicle dispatch ready / trip cleared
  voucher_created_driver: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*🚛 Trip Cleared — Driver Copy*',
      '*Voucher:* #{voucherNo} | *LR:* #{lrNo} | *Date:* {date}',
      '*Truck:* {truckNo} | *Destination:* {destination}',
      'Advances: Diesel: Rs.{advanceDiesel} | Cash: Rs.{advanceCash} | Online: Rs.{advanceOnline}',
      '*Balance Due:* Rs.{netBalance} | *Status:* {paymentStatus}',
      '✅ *DISPATCH READY:* You are cleared to leave for {destination}. Drive safe!'
    ].join('\n')
  },
  // Notification to creator when an action is performed via webhook
  voucher_action_creator: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*✅ Voucher #{voucherNo} Marked PAID*',
      '*Truck:* {truckNo} | *LR:* #{lrNo}',
      '*Online Advance:* Rs.{advanceOnline} | *Date:* {paidDate}',
      'Online advance marked PAID via WhatsApp.'
    ].join('\n')
  },
  // Challan issued to vehicle owner
  challan_created_owner: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '📝 *Challan Issued — #{challanNo}*',
      '*Date:* {date} | *Truck:* {truckNo}',
      '*Party:* {partyName} | *Destination:* {destination}',
      '*Materials:* {materialsText}',
      '*Total:* {totalWeight} MT ({totalBags} Bags)',
      '👉 _Your challan has been registered. Loading will follow._'
    ].join('\n')
  },
  // Alert to original vehicle owner when their challan is transferred to another vehicle
  challan_transferred_original_owner: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '⚠️ *Challan Transfer Alert*',
      '*Challan #{challanNo}* ({materialsText}) originally for *{originalTruck}* has been loaded by vehicle *{loadingTruck}*.',
      '*Loading Receipt:* LR #{lrNo} | *Date:* {date}',
      'ℹ️ *Note:* All freight for this trip is credited to vehicle *{loadingTruck}*.'
    ].join('\n')
  },
  // Alert when challan is linked later to an existing LR
  challan_linked_owner: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '🔗 *Challan Linked to LR #{lrNo}*',
      '*Truck:* {truckNo} | *Date:* {date}',
      '*Challan #{challanNo}* ({materialsText}) has been successfully attached to your loading receipt.',
      '👉 _Record updated in system._'
    ].join('\n')
  },
  balance_paid: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*💳 Balance Payment Dispatched*',
      '*Truck:* {truckNo} | *Trips:* {tripCount}',
      '*Period:* {periodFrom} - {periodTo}',
      'Payment batch sent for processing.'
    ].join('\n')
  },
  cashout: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*💸 Cash Out Alert*',
      '*Recipient:* {entityName} ({entityType})',
      '*Amount:* Rs.{amount} | *Date:* {date}',
      '*Remark:* {remark}'
    ].join('\n')
  },
  deposit: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*💰 Deposit Received*',
      '*Amount:* Rs.{amount} | *Date:* {date}',
      '*Remark:* {remark}'
    ].join('\n')
  },
  deposit_with_balance: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.* 💰',
      '*Deposit Received in Cashbook*',
      '*Amount:* Rs.{amount} | *Date:* {date}',
      '*Remark:* {remark}',
      'Previous Balance: Rs.{prevBalance}',
      '*New Cashbook Balance:* *Rs.{newBalance}*'
    ].join('\n')
  },
  cashbook_low_balance: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.* ⚠️',
      '*LOW CASHBOOK BALANCE ALERT*',
      'Current Cashbook balance is *Rs.{currentBalance}* (Below Rs.5,000 minimum limit).',
      '👉 Please deposit funds to maintain operational balance.'
    ].join('\n')
  },
  staff_cashout_prompt: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.* 💸',
      '*Cash Advance / Cashout Alert*',
      'Dear *{staffName}*,',
      'An amount of *Rs.{amount}* has been issued to you from Cashbook.',
      '• *Date:* {date}',
      '• *Remark:* {remark}',
      '• *Advance Deducted:* Rs.{amount}',
      '• *Total Advances Taken:* Rs.{totalAdvances}',
      '• *Remaining Net Pay:* *Rs.{remainingPay}*',
      'Please confirm or decline using the buttons below:'
    ].join('\n')
  },
  staff_cashout_disputed_admin: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.* ⚠️',
      '*STAFF CASHOUT DISPUTE REQUIRING APPROVAL*',
      'Staff *{staffName}* has DECLINED / DISPUTED Cashout #{entryId}:',
      '• *Amount:* Rs.{amount} | *Date:* {date}',
      '• *Remark:* {remark}',
      'Approve reversal to restore cashbook & staff balance?'
    ].join('\n')
  },
  staff_cashout_reversed_staff: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.* ✅',
      '*Cashout Dispute Approved*',
      'Dear *{staffName}*,',
      'Your decline for Cashout #{entryId} (Rs.{amount}) has been APPROVED by Admin.',
      'The deduction has been reversed and your balance is restored.'
    ].join('\n')
  },
  // Clerk/admin alert when a voucher with online advance is created
  online_advance_clerk: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*💰 ONLINE ADVANCE TO PAY*',
      '*Voucher:* #{voucherNo} | *LR:* #{lrNo}',
      '*Truck:* {truckNo} | *Date:* {date}',
      '*Advance Amount:* *Rs.{advanceOnline}*',
      '*Driver:* {driverName} | *To:* {destination}'
    ].join('\n')
  },
  // Owner notification when online advance payment is confirmed
  online_advance_paid_owner: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*✅ Online Advance Paid*',
      '*Voucher:* #{voucherNo} | *LR:* #{lrNo} | *Truck:* {truckNo}',
      '*Amount Transferred:* *Rs.{advanceOnline}* | *Date:* {paidDate}',
      'Online advance has been transferred to your account.'
    ].join('\n')
  },
  // Driver notification when online advance payment is confirmed
  online_advance_paid_driver: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*✅ Online Advance Paid*',
      '*Voucher:* #{voucherNo} | *LR:* #{lrNo} | *Truck:* {truckNo}',
      '*Amount:* *Rs.{advanceOnline}* | *Date:* {paidDate}',
      'Please check your account for the transfer.'
    ].join('\n')
  },
  // Clerk reminder when an online advance created on a previous day remains unpaid
  online_advance_pending_reminder: {
    enabled: true,
    template: [
      '*VIKAS GOODS TRANSPORT CO.*',
      '*⚠️ PENDING ONLINE ADVANCE*',
      '*Voucher:* #{voucherNo} | *LR:* #{lrNo}',
      '*Truck:* {truckNo} | *Date:* {date}',
      '*Pending Advance:* *Rs.{advanceOnline}*',
      '*Driver:* {driverName} | *To:* {destination}'
    ].join('\n')
  }
};

// ─── Emoji Stripping Helper ───────────────────────────────────────────────────

function stripEmojis(str) {
  if (!str) return '';
  return String(str);
}

function cleanEventsEmojis(eventsObj) {
  if (!eventsObj || typeof eventsObj !== 'object') return {};
  return eventsObj;
}

// ─── Config CRUD ───────────────────────────────────────────────────────────────

const DEFAULT_VERIFY_TOKEN = 'vgtc_meta_verify_token_2026';

async function getWhatsAppConfig(req = null) {
  try {
    let cfg = null;
    if (!isAvailable()) {
      cfg = localStore.getById(CONFIG_COL, CONFIG_DOC_ID);
    } else {
      const colName = req ? getCol(CONFIG_COL, req) : getEnvCol(CONFIG_COL);
      const doc = await db.collection(colName).doc(CONFIG_DOC_ID).get();
      if (doc.exists) cfg = doc.data();
    }
    const finalCfg = cfg || {};
    const savedEvents = { ...(finalCfg.events || {}) };
    for (const key of Object.keys(DEFAULT_TEMPLATES)) {
      if (savedEvents[key] && (
        savedEvents[key].template?.includes('┈┈') ||
        savedEvents[key].template?.includes('Trip Dispatched') ||
        savedEvents[key].template?.includes('Tap poll below') ||
        savedEvents[key].template?.includes('Tap to Mark') ||
        savedEvents[key].template?.includes('quickReplyUrl') ||
        savedEvents[key].template?.includes('wa.me') ||
        savedEvents[key].template?.includes('Or reply:')
      )) {
        delete savedEvents[key];
      }
    }
    const rawEvents = { ...DEFAULT_TEMPLATES, ...savedEvents };
    const cleanedEvents = cleanEventsEmojis(rawEvents);
    let token = (finalCfg.accessToken || finalCfg.apiKey || process.env.META_ACCESS_TOKEN || '').trim();
    if (token.startsWith('EAAi5P5cv9icdCe') || token.includes('TMkrg6UtaDyzH4TT3qnx6njnhEDBqsq4Hn')) {
      token = '';
    }
    let adminList = [];
    if (Array.isArray(finalCfg.adminPhones) && finalCfg.adminPhones.length > 0) {
      adminList = finalCfg.adminPhones.map(p => String(p).trim().replace(/\D/g, '')).filter(Boolean);
    } else if (typeof finalCfg.adminPhones === 'string' && finalCfg.adminPhones.trim()) {
      adminList = finalCfg.adminPhones.split(/[,;\s]+/).map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
    }
    if (!adminList.length) {
      adminList = [
        (finalCfg.adminPhone || HARDCODED_ADMIN).trim().replace(/\D/g, ''),
        '9416319445',
        '9728954901',
        '9728284849'
      ].filter(Boolean);
    }
    const adminPhones = Array.from(new Set(adminList));

    return {
      enabled: finalCfg.enabled !== undefined ? !!finalCfg.enabled : false,
      provider: 'meta',
      phoneNumberId: (finalCfg.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '').trim(),
      wabaId: (finalCfg.wabaId || process.env.META_WABA_ID || '').trim(),
      accessToken: token,
      webhookVerifyToken: (finalCfg.webhookVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN).trim(),
      adminPhone: adminPhones[0] || HARDCODED_ADMIN,
      adminPhones,
      labourPhones: (finalCfg.labourPhones || finalCfg.labourPhone || DEFAULT_LABOUR_PHONE).trim(),
      payloadFormat: 'meta',
      events: cleanedEvents
    };
  } catch (e) {
    const fallbackAdmins = [HARDCODED_ADMIN, '9416319445', '9728954901', '9728284849'];
    return {
      enabled: false,
      provider: 'meta',
      phoneNumberId: '',
      wabaId: '',
      accessToken: '',
      webhookVerifyToken: DEFAULT_VERIFY_TOKEN,
      adminPhone: HARDCODED_ADMIN,
      adminPhones: fallbackAdmins,
      labourPhones: DEFAULT_LABOUR_PHONE,
      payloadFormat: 'meta',
      events: cleanEventsEmojis(DEFAULT_TEMPLATES)
    };
  }
}

/**
 * Broadcasts an alert or interactive button message to all configured Admin numbers.
 */
async function broadcastToAdmins(title, message, actionButtons = null, req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled) return [];
  const phones = config.adminPhones || [config.adminPhone || HARDCODED_ADMIN];
  const results = [];
  for (const phone of phones) {
    try {
      if (actionButtons && actionButtons.length > 0) {
        await sendWhatsAppButtons(phone, title, message, actionButtons, req);
      } else {
        await sendWhatsAppMessage(phone, message, req);
      }
      results.push({ phone, success: true });
    } catch (err) {
      console.error(`[WA-Broadcast] Failed to send to admin ${phone}:`, err.message);
      results.push({ phone, success: false, error: err.message });
    }
  }
  return results;
}

async function saveWhatsAppConfig(config, req = null) {
  const payload = {
    ...config,
    enabled: config.enabled !== undefined ? !!config.enabled : false,
    provider: 'meta',
    phoneNumberId: (config.phoneNumberId || '').trim(),
    wabaId: (config.wabaId || '').trim(),
    accessToken: (config.accessToken || config.apiKey || '').trim(),
    webhookVerifyToken: (config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN).trim(),
    adminPhone: (config.adminPhone || HARDCODED_ADMIN).trim(),
    labourPhones: (config.labourPhones || DEFAULT_LABOUR_PHONE).trim(),
    payloadFormat: 'meta',
    updatedAt: new Date().toISOString()
  };
  if (config.events) {
    payload.events = cleanEventsEmojis(config.events);
  }
  if (!isAvailable()) {
    localStore.upsert(CONFIG_COL, CONFIG_DOC_ID, payload);
  } else {
    const colName = req ? getCol(CONFIG_COL, req) : getEnvCol(CONFIG_COL);
    await db.collection(colName).doc(CONFIG_DOC_ID).set(payload, { merge: true });
  }
  return payload;
}

// ─── Phone normalisation (Meta E.164: e.g. 918708032492) ────────────────────────

function formatMetaPhone(phone) {
  if (!phone) return '';
  let str = String(phone).trim();
  str = str.replace(/@c\.us|@s\.whatsapp\.net|@lid|@g\.us/g, '');
  let cleaned = str.replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  if (cleaned.startsWith('0')) cleaned = '91' + cleaned.slice(1);
  return cleaned;
}

// Alias for backwards compatibility
function formatPhoneWid(phone) {
  return formatMetaPhone(phone);
}

/**
 * Discover the connected bot's phone number for wa.me quick-reply link generation
 */
async function discoverBotPhoneNumber(config) {
  if (config.senderPhone) {
    const raw = formatMetaPhone(config.senderPhone);
    if (raw) return raw;
  }
  const fallback = formatMetaPhone(config.adminPhone || HARDCODED_ADMIN || '8708032492');
  return fallback || '918708032492';
}

let cachedPublicUrl = null;
let lastPublicUrlCheck = 0;

/**
 * Dynamically discover public URL for 1-click action links (ngrok / env / fallback)
 */
async function getPublicActionBaseUrl() {
  const now = Date.now();
  if (cachedPublicUrl && (now - lastPublicUrlCheck < 30000)) {
    return cachedPublicUrl;
  }
  if (process.env.PUBLIC_ACTION_URL) {
    cachedPublicUrl = process.env.PUBLIC_ACTION_URL.replace(/\/+$/, '');
    lastPublicUrlCheck = now;
    return cachedPublicUrl;
  }
  try {
    const res = await axios.get('http://127.0.0.1:4040/api/tunnels', { timeout: 800 });
    const httpsTunnel = res.data?.tunnels?.find(t => t.proto === 'https');
    if (httpsTunnel?.public_url) {
      cachedPublicUrl = httpsTunnel.public_url.replace(/\/+$/, '');
      lastPublicUrlCheck = now;
      return cachedPublicUrl;
    }
  } catch (_) {}

  cachedPublicUrl = 'https://unworn-sensitive-cinch.ngrok-free.dev';
  lastPublicUrlCheck = now;
  return cachedPublicUrl;
}

// ─── Status check ─────────────────────────────────────────────────────────────

async function checkWhatsAppStatus(req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.phoneNumberId || !config.accessToken) {
    return {
      connected: false,
      message: 'Meta Cloud API credentials missing: Phone Number ID or Permanent Access Token not set in settings'
    };
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;
    const res = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`
      },
      timeout: 10000
    });

    if (res.status >= 200 && res.status < 300 && res.data) {
      return {
        connected: true,
        message: 'Meta WhatsApp Cloud API Online & Verified',
        verifiedName: res.data.verified_name || 'VGTC Business',
        displayPhoneNumber: res.data.display_phone_number || '',
        qualityRating: res.data.quality_rating || 'UNKNOWN',
        codeVerificationStatus: res.data.code_verification_status || 'VERIFIED',
        id: res.data.id
      };
    }
  } catch (err) {
    // Fallback check for test numbers or temporary tokens that don't support field lookups
    try {
      if (config.wabaId) {
        const fallbackUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(config.wabaId)}?fields=id,name`;
        const fbRes = await axios.get(fallbackUrl, {
          headers: { 'Authorization': `Bearer ${config.accessToken}` },
          timeout: 5000
        });
        if (fbRes.data && fbRes.data.id) {
          return {
            connected: true,
            message: 'Meta Cloud API Connected (WABA Active)',
            verifiedName: fbRes.data.name || 'VGTC WhatsApp Account',
            displayPhoneNumber: config.phoneNumberId || '',
            qualityRating: 'GOOD',
            codeVerificationStatus: 'VERIFIED',
            id: fbRes.data.id
          };
        }
      }
    } catch (_) {}

    const metaErr = err.response?.data?.error;
    const errMsg = metaErr?.message || err.message || 'Failed to connect to Meta Cloud API';
    const isAuthErr = err.response && (err.response.status === 401 || err.response.status === 403);
    return {
      connected: false,
      message: isAuthErr ? `Meta Authentication Failed: ${errMsg}` : `Meta API Error: ${errMsg}`,
      errorDetails: metaErr || null
    };
  }

  return { connected: false, message: 'Meta Cloud API Unreachable' };
}

// ─── Template interpolation ────────────────────────────────────────────────────

/**
 * Replaces {key} placeholders in a template string with values from `data`.
 * Unknown keys are left as empty strings so the message is never broken.
 */
function interpolateTemplate(template, data) {
  const result = (template || '').replace(/\{(\w+)\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
  return stripEmojis(result);
}

// ─── Vehicle info lookup ───────────────────────────────────────────────────────

/**
 * Fetches the full vehicle record for a given truckNo.
 * Returns { ownerContact, driverContact, ownershipType, ownerName, driverName }
 * or null if not found.
 */
async function lookupVehicleInfo(truckNo, req = null) {
  if (!truckNo) return null;
  try {
    const colName = req ? getCol('vehicles', req) : getEnvCol('vehicles');
    let vehicles = [];
    if (!isAvailable()) {
      vehicles = localStore.getAll('vehicles').filter(
        v => String(v.truckNo || '').toUpperCase() === String(truckNo).toUpperCase()
      );
    } else {
      let query = db.collection(colName).where('truckNo', '==', String(truckNo).toUpperCase());
      if (req?.orgId) {
        query = query.where('orgId', '==', req.orgId);
      }
      const snap = await query.limit(1).get();
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
 * Looks up a profile from 'profiles' collection by ID or name,
 * and returns its contact phone number (phone, contact, contactNo, mobile).
 */
async function lookupProfilePhone(profileIdOrName, req = null) {
  if (!profileIdOrName) return null;
  try {
    const searchStr = String(profileIdOrName).trim();
    const searchUpper = searchStr.toUpperCase();
    const colName = req ? getCol('profiles', req) : getEnvCol('profiles');
    let profiles = [];
    if (!isAvailable()) {
      profiles = localStore.getAll('profiles');
    } else {
      const snap = await db.collection(colName).get();
      profiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const found = profiles.find(
      p => String(p.id || '').trim() === searchStr ||
           String(p.name || '').trim().toUpperCase() === searchUpper ||
           String(p.profileName || '').trim().toUpperCase() === searchUpper ||
           String(p.driverName || '').trim().toUpperCase() === searchUpper ||
           String(p.staffName || '').trim().toUpperCase() === searchUpper
    );
    if (found) {
      const phone = found.phone || found.contact || found.contactNo || found.mobile || found.phoneNumber || found.mobileNo || found.phoneNo;
      if (phone) return String(phone).trim();
    }

    // Fallback: search vehicles collection by driver or owner name
    const vCol = req ? getCol('vehicles', req) : getEnvCol('vehicles');
    let vehicles = [];
    if (!isAvailable()) {
      vehicles = localStore.getAll('vehicles');
    } else {
      const vSnap = await db.collection(vCol).get();
      vehicles = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const vFound = vehicles.find(
      v => String(v.truckNo || '').trim().toUpperCase() === searchUpper ||
           String(v.driverName || '').trim().toUpperCase() === searchUpper ||
           String(v.ownerName || '').trim().toUpperCase() === searchUpper
    );
    if (vFound) {
      const phone = vFound.driverContact || vFound.ownerContact || vFound.driverPhone || vFound.ownerPhone;
      if (phone) return String(phone).trim();
    }
  } catch (e) {
    console.error('[WA] lookupProfilePhone error:', e.message);
  }
  return null;
}

/**
 * Looks up a user's phone number by user ID, username, or name.
 * Searches users collection, then falls back to lookupProfilePhone.
 */
async function lookupUserPhone(userIdOrName, req = null) {
  if (!userIdOrName) return null;
  try {
    const searchStr = String(userIdOrName).trim();
    const searchUpper = searchStr.toUpperCase();
    const uCol = req ? getCol('users', req) : getEnvCol('users');
    let users = [];
    if (!isAvailable()) {
      users = localStore.getAll('users');
    } else {
      const snap = await db.collection(uCol).get();
      users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const found = users.find(u =>
      String(u.id || '').trim() === searchStr ||
      String(u.username || '').trim().toUpperCase() === searchUpper ||
      String(u.name || '').trim().toUpperCase() === searchUpper
    );
    if (found) {
      const phone = found.phone || found.contact || found.mobile || found.contactNo || found.phoneNo;
      if (phone) return String(phone).trim();
    }
  } catch (e) {
    console.error('[WA] lookupUserPhone error:', e.message);
  }
  return await lookupProfilePhone(userIdOrName, req);
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

// ─── Meta WhatsApp Cloud API Core Senders ─────────────────────────────────────

async function sendWhatsAppMessage(phone, message, req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled) {
    throw new Error('WhatsApp dispatch is disabled in Control Module settings');
  }
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error('Meta Cloud API credentials (Phone Number ID / Permanent Access Token) not configured');
  }

  const to = formatMetaPhone(phone);
  if (!to) {
    throw new Error('Invalid phone number provided for WhatsApp dispatch');
  }

  const cleanMsg = stripEmojis(message);
  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: cleanMsg
    }
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });
    logWhatsAppActivity({
      type: 'outbound',
      category: 'text_message',
      phone: to,
      status: 'sent',
      title: 'WhatsApp Message Sent',
      details: cleanMsg.slice(0, 160)
    });
    return res.data;
  } catch (err) {
    const metaErr = err.response?.data?.error;
    const errMsg = metaErr?.message || err.message || 'Failed to dispatch Meta WhatsApp message';
    logWhatsAppActivity({
      type: 'outbound',
      category: 'text_message',
      phone: to,
      status: 'failed',
      title: 'WhatsApp Message Failed',
      details: cleanMsg.slice(0, 160),
      error: errMsg
    });
    console.error(`[Meta-WA] Send text to ${to} failed:`, errMsg, metaErr?.error_data || '');
    throw new Error(`Meta API: ${errMsg}`);
  }
}

// ─── Button Send Utility (Meta Cloud API Interactive Reply Buttons) ────────────

async function sendWhatsAppButtons(phone, title, text, buttons = [], req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled) {
    throw new Error('WhatsApp dispatch is disabled in Control Module settings');
  }
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error('Meta Cloud API credentials (Phone Number ID / Permanent Access Token) not configured');
  }

  const to = formatMetaPhone(phone);
  if (!to) {
    throw new Error('Invalid phone number provided for WhatsApp dispatch');
  }

  // Meta interactive buttons allow 1 to 3 reply buttons
  const metaButtons = buttons.slice(0, 3).map((b, idx) => ({
    type: 'reply',
    reply: {
      id: String(b.id || `btn_${idx}`).slice(0, 256),
      title: String(b.text || b.label || 'Click').slice(0, 20) // Meta max 20 chars
    }
  }));

  if (!metaButtons.length) {
    return await sendWhatsAppMessage(phone, text, req);
  }

  const bodyText = stripEmojis(text || 'Please select an option below:').slice(0, 1024);
  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: { buttons: metaButtons },
    footer: { text: 'VIKAS GOODS TRANSPORT CO.' }
  };

  if (title) {
    interactive.header = {
      type: 'text',
      text: stripEmojis(title).slice(0, 60)
    };
  }

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });
    logWhatsAppActivity({
      type: 'outbound',
      category: 'interactive_button',
      phone: to,
      status: 'sent',
      title: `Button Message: ${title || 'Interactive'}`,
      details: bodyText.slice(0, 160)
    });
    return res.data;
  } catch (err) {
    console.warn(`[Meta-WA] Interactive button failed for ${to} (${err.response?.data?.error?.message || err.message}). Falling back to text...`);
    logWhatsAppActivity({
      type: 'outbound',
      category: 'interactive_button',
      phone: to,
      status: 'failed',
      title: `Button Message Failed: ${title || 'Interactive'}`,
      details: bodyText.slice(0, 160),
      error: err.response?.data?.error?.message || err.message
    });
    return await sendWhatsAppMessage(phone, text, req);
  }
}

// ─── Poll Send Utility (Delegates to Interactive Buttons) ──────────────────────

async function sendWhatsAppPoll(phone, name, options = [], req = null) {
  const buttons = (options || []).slice(0, 3).map((opt, idx) => ({
    id: `opt_${idx}_${String(opt).replace(/\W+/g, '_')}`,
    text: String(opt).slice(0, 20)
  }));
  return await sendWhatsAppButtons(phone, 'ACTION REQUIRED', name, buttons, req);
}

// ─── Meta Official Template Send Utility ───────────────────────────────────────

async function sendMetaTemplate(phone, templateName, languageCode = 'en', components = [], req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled || !config.phoneNumberId || !config.accessToken) {
    throw new Error('Meta Cloud API credentials not configured');
  }

  const to = formatMetaPhone(phone);
  if (!to) throw new Error('Invalid phone number for template dispatch');

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components && components.length ? components : undefined
    }
  };

  const res = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 25000
  });
  return res.data;
}

// Backwards-compatible alias for sendOpenWATemplate
async function sendOpenWATemplate(phone, templateName, variables = {}, req = null) {
  return await sendMetaTemplate(phone, templateName, 'en', [], req);
}

// ─── Image Send Utility (Meta Media Upload + Message Dispatch) ────────────────

async function sendWhatsAppImage(phone, imageBuffer, caption = '', req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled) {
    throw new Error('WhatsApp dispatch is disabled');
  }
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error('Meta Cloud API credentials not configured');
  }

  const to = formatMetaPhone(phone);
  if (!to) {
    throw new Error('Invalid phone number provided for WhatsApp dispatch');
  }

  try {
    // 1. Upload media buffer to Meta Graph API
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('file', blob, 'loading_slip.png');
    formData.append('type', 'image/png');
    formData.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`
        },
        timeout: 30000
      }
    );

    const mediaId = uploadRes.data?.id;
    if (!mediaId) throw new Error('Meta media upload did not return an id');

    // 2. Dispatch image message referencing uploaded media id
    const msgPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        id: mediaId,
        caption: caption ? stripEmojis(caption).slice(0, 1024) : undefined
      }
    };

    const msgRes = await axios.post(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}/messages`,
      msgPayload,
      {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      }
    );
    return msgRes.data;
  } catch (err) {
    console.warn(`[Meta-WA] Image dispatch failed (${err.response?.data?.error?.message || err.message}). Falling back to text caption...`);
    if (caption) {
      return await sendWhatsAppMessage(phone, caption, req);
    }
    throw err;
  }
}

// ─── Document Send Utility (Meta Media Upload + Document Message Dispatch) ────

async function sendWhatsAppDocument(phone, docBuffer, filename = 'document.pdf', mimeType = 'application/pdf', caption = '', req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled) {
    throw new Error('WhatsApp dispatch is disabled');
  }
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error('Meta Cloud API credentials not configured');
  }

  const to = formatMetaPhone(phone);
  if (!to) {
    throw new Error('Invalid phone number provided for WhatsApp dispatch');
  }

  try {
    // 1. Upload document buffer to Meta Graph API
    const formData = new FormData();
    const blob = new Blob([docBuffer], { type: mimeType });
    formData.append('file', blob, filename);
    formData.append('type', mimeType);
    formData.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`
        },
        timeout: 45000
      }
    );

    const mediaId = uploadRes.data?.id;
    if (!mediaId) throw new Error('Meta media upload did not return an id');

    // 2. Dispatch document message referencing uploaded media id
    const msgPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        id: mediaId,
        caption: caption ? stripEmojis(caption).slice(0, 1024) : undefined,
        filename: filename
      }
    };

    const msgRes = await axios.post(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(config.phoneNumberId)}/messages`,
      msgPayload,
      {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    return msgRes.data;
  } catch (err) {
    console.warn(`[Meta-WA] Document dispatch failed (${err.response?.data?.error?.message || err.message}). Falling back to text caption...`);
    if (caption) {
      return await sendWhatsAppMessage(phone, caption, req);
    }
    throw err;
  }
}

// ─── Receipt Canvas Image Generator ───────────────────────────────────────────

function generateLrReceiptImageBuffer(lr) {
  const width = 650;
  const materials = Array.isArray(lr.materials) && lr.materials.length > 0
    ? lr.materials
    : [{ type: lr.material || 'Cement', bags: lr.bags || 0, weight: lr.weight || 0, loadingType: lr.loadingType || 'From Godown' }];

  const totalBags = materials.reduce((s, m) => s + (parseInt(m.bags) || 0), 0);
  const totalWeight = materials.reduce((s, m) => s + (parseFloat(m.weight) || 0), 0);

  // Dynamic height calculation
  const itemRowH = 50;
  const height = 800 + (materials.length * itemRowH);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  let curY = 35;

  // Draw Centered Logo
  if (preloadedLogoMark) {
    const logoW = 200;
    const logoH = Math.round((preloadedLogoMark.height / preloadedLogoMark.width) * logoW);
    ctx.drawImage(preloadedLogoMark, (width - logoW) / 2, curY, logoW, logoH);
    curY += logoH + 10;
  } else {
    curY += 15;
  }

  // Company Name
  ctx.fillStyle = '#000000';
  ctx.font = `bold 28px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('VIKAS GOODS TRANSPORT', width / 2, curY + 20);
  curY += 28;

  // Address & Contacts
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.fillText('Jharli, Jhajjar | 9416319445, 9728954901, 9728284849', width / 2, curY + 16);
  curY += 24;

  // Subtitle
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText('LOADING SLIP • लोडिंग स्लिप', width / 2, curY + 22);
  curY += 34;

  // Thick Horizontal Divider Bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(40, curY, width - 80, 5);
  curY += 15;

  // Header Sub-info (ID, No, Date)
  const idNo = lr.entryId || (lr.id ? String(lr.id).replace(/\D/g, '').slice(-6) : null) || '100009';
  const lrNo = lr.lrNo || lr.loadingNo || '19';
  const dateStr = formatSlipDate(lr.date);

  // Left Info
  ctx.textAlign = 'left';
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText('ID / आईडी:', 40, curY + 22);
  ctx.fillText(`#${idNo}`, 40, curY + 50);
  ctx.fillText(`नं0 / No. ${lrNo}`, 40, curY + 84);

  // Right Date
  ctx.textAlign = 'right';
  ctx.fillText(`दिनांक / Date: ${dateStr}`, width - 40, curY + 22);

  curY += 100;

  // Table 1: Truck, Party, Weight
  const topBoxY = curY;
  const topBoxH = 135;
  const splitX = 220;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, topBoxY, width - 80, topBoxH);

  const tRowH = topBoxH / 3;
  ctx.beginPath();
  ctx.moveTo(40, topBoxY + tRowH);
  ctx.lineTo(width - 40, topBoxY + tRowH);
  ctx.moveTo(40, topBoxY + tRowH * 2);
  ctx.lineTo(width - 40, topBoxY + tRowH * 2);
  ctx.moveTo(splitX, topBoxY);
  ctx.lineTo(splitX, topBoxY + topBoxH);
  ctx.stroke();

  ctx.textAlign = 'left';

  // Row 1
  ctx.font = `bold 15px ${FONT_FAMILY}`;
  ctx.fillText('गाड़ी नं0 / TRUCK NO.', 52, topBoxY + 28);
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText(String(lr.truckNo || '—').toUpperCase(), splitX + 16, topBoxY + 30);

  // Row 2
  ctx.font = `bold 15px ${FONT_FAMILY}`;
  ctx.fillText('पार्टी / PARTY', 52, topBoxY + tRowH + 28);
  ctx.font = `bold 20px ${FONT_FAMILY}`;
  ctx.fillText(String(lr.partyName || '—').toUpperCase(), splitX + 16, topBoxY + tRowH + 29);

  // Row 3
  ctx.font = `bold 15px ${FONT_FAMILY}`;
  ctx.fillText('वजन / WEIGHT', 52, topBoxY + tRowH * 2 + 28);
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText(`${totalWeight.toFixed(2)} MT`, splitX + 16, topBoxY + tRowH * 2 + 30);

  curY += topBoxH + 25;

  // Table 2: Materials Breakdown
  const tableY = curY;
  const col1W = 330;
  const col2W = 110;
  const col3W = (width - 80) - col1W - col2W;
  const headerH = 45;
  const totalRowH = 45;
  const tableH = headerH + (materials.length * itemRowH) + totalRowH;

  ctx.strokeRect(40, tableY, width - 80, tableH);

  // Table Header
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(40, tableY, width - 80, headerH);
  ctx.fillStyle = '#000000';

  ctx.beginPath();
  ctx.moveTo(40, tableY + headerH);
  ctx.lineTo(width - 40, tableY + headerH);

  const c1X = 40 + col1W;
  const c2X = c1X + col2W;
  ctx.moveTo(c1X, tableY);
  ctx.lineTo(c1X, tableY + tableH);
  ctx.moveTo(c2X, tableY);
  ctx.lineTo(c2X, tableY + tableH);
  ctx.stroke();

  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('सामान / MATERIAL', 52, tableY + 28);

  ctx.textAlign = 'center';
  ctx.fillText('बैग /', c1X + col2W / 2, tableY + 20);
  ctx.fillText('BAGS', c1X + col2W / 2, tableY + 36);

  ctx.fillText('वजन / WT', c2X + col3W / 2, tableY + 28);

  let rowY = tableY + headerH;
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    ctx.beginPath();
    ctx.moveTo(40, rowY + itemRowH);
    ctx.lineTo(width - 40, rowY + itemRowH);
    ctx.stroke();

    // Material Title & Subtitle
    ctx.font = `bold 18px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    const matName = m.type || lr.material || 'Cement';
    ctx.fillText(matName, 52, rowY + 22);

    ctx.font = `14px ${FONT_FAMILY}`;
    const lType = m.loadingType || lr.loadingType || 'From Godown';
    const lTypeHindi = lType.toLowerCase().includes('godown') ? 'गोदाम से' : 'प्लांट से';
    ctx.fillText(`${lType} • ${lTypeHindi}`, 52, rowY + 41);

    ctx.textAlign = 'center';
    ctx.font = `bold 18px ${FONT_FAMILY}`;
    ctx.fillText(String(m.bags || 0), c1X + col2W / 2, rowY + 32);
    ctx.fillText(parseFloat(m.weight || 0).toFixed(2), c2X + col3W / 2, rowY + 32);

    rowY += itemRowH;
  }

  // Total Row
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(40, rowY, width - 80, totalRowH);
  ctx.fillStyle = '#000000';

  ctx.font = `bold 18px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('कुल / TOTAL', 52, rowY + 28);

  ctx.textAlign = 'center';
  ctx.fillText(String(totalBags), c1X + col2W / 2, rowY + 28);
  ctx.fillText(totalWeight.toFixed(2), c2X + col3W / 2, rowY + 28);

  curY = tableY + tableH + 45;

  // Signatures
  const sigLineY = curY + 45;
  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.moveTo(40, sigLineY);
  ctx.lineTo(250, sigLineY);
  ctx.stroke();

  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('चालक / DRIVER', 60, sigLineY + 25);

  // Auth box
  const boxW = 250;
  const boxH = 95;
  const boxX = width - 40 - boxW;
  const boxY = curY;

  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.font = `bold 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('हस्ताक्षर / SIGNATURE', boxX + boxW / 2, boxY + 22);

  ctx.font = 'italic bold 24px cursive, "Brush Script MT", sans-serif';
  ctx.fillText('Vikas Admin', boxX + boxW / 2, boxY + 54);

  ctx.font = `bold 12px ${FONT_FAMILY}`;
  ctx.fillText('Auth. Signatory', boxX + boxW / 2, boxY + 78);

  return canvas.toBuffer('image/png');
}

// ─── Voucher Canvas Image Generator ───────────────────────────────────────────

function generateVoucherImageBuffer(v) {
  const width = 650;

  const weight = parseFloat(v.weight || 0);
  const rate = parseFloat(v.rate || 0);
  const gross = parseFloat(v.freight) || (rate * weight);

  const diesel = parseFloat(v.advanceDiesel) || 0;
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const munshi = parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
  const shortage = parseFloat(v.shortage) || 0;
  const commission = parseFloat(v.commission) || 0;
  const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
  const tyreGreasing = (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0);
  const extraCash = parseFloat(v.extraCash) || 0;

  const totalDeductions = diesel + cash + online + munshi + shortage + commission + tyrePuncture + tyreGreasing + extraCash;
  const net = gross - totalDeductions;

  const rows = [];
  rows.push({ label: `कुल भाड़ा / Gross Freight (${weight} MT @ ₹${rate})`, val: gross, isCredit: true });
  if (diesel > 0) rows.push({ label: 'डीजल पेशगी / Advance Diesel', val: diesel });
  if (cash > 0) rows.push({ label: 'कैश पेशगी / Advance Cash', val: cash });
  if (online > 0) rows.push({ label: `ऑनलाइन पेशगी / Online Advance (${v.isOnlinePaid ? 'PAID' : 'PENDING'})`, val: online });
  if (munshi > 0) rows.push({ label: 'मुंशी / Munshi Fee', val: munshi });
  if (shortage > 0) rows.push({ label: 'शॉर्टेज / Shortage Claim', val: shortage });
  if (commission > 0) rows.push({ label: 'कमीशन / Commission', val: commission });
  if (tyrePuncture + tyreGreasing > 0) rows.push({ label: 'टायर व ग्रीसिंग / Tyre & Greasing', val: tyrePuncture + tyreGreasing });
  if (extraCash > 0) rows.push({ label: 'अन्य कटौती / Extra Cash', val: extraCash });

  const baseH = 880;
  const itemRowH = 40;
  const height = baseH + (rows.length * itemRowH);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  let curY = 35;

  // Draw Centered Logo
  if (preloadedLogoMark) {
    const logoW = 200;
    const logoH = Math.round((preloadedLogoMark.height / preloadedLogoMark.width) * logoW);
    ctx.drawImage(preloadedLogoMark, (width - logoW) / 2, curY, logoW, logoH);
    curY += logoH + 10;
  } else {
    curY += 15;
  }

  // Company Name
  ctx.fillStyle = '#000000';
  ctx.font = `bold 28px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('VIKAS GOODS TRANSPORT', width / 2, curY + 20);
  curY += 28;

  // Address & Contacts
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.fillText('Jharli, Jhajjar | 9416319445, 9728954901, 9728284849', width / 2, curY + 16);
  curY += 24;

  // Subtitle
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText('FREIGHT VOUCHER • भाड़ा वाउचर', width / 2, curY + 22);
  curY += 34;

  // Thick Horizontal Divider Bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(40, curY, width - 80, 5);
  curY += 15;

  // Header Sub-info (ID, Voucher No, Date)
  const idNo = v.entryId || (v.id ? String(v.id).replace(/\D/g, '').slice(-6) : null) || '100009';
  const vNo = v.voucherNo || v.lrNo || '—';
  const dateStr = formatSlipDate(v.date);

  // Left Info
  ctx.textAlign = 'left';
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText('ID / आईडी:', 40, curY + 22);
  ctx.fillText(`#${idNo}`, 40, curY + 50);
  ctx.fillText(`वाउचर नं0 / Voucher No. ${vNo}`, 40, curY + 84);

  // Right Date
  ctx.textAlign = 'right';
  ctx.fillText(`दिनांक / Date: ${dateStr}`, width - 40, curY + 22);

  curY += 100;

  // Table 1: Top Details (Truck, LR, Party, Destination, Weight, Rate)
  const topBoxY = curY;
  const topBoxH = 140;
  const splitX = 220;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, topBoxY, width - 80, topBoxH);

  const tRowH = topBoxH / 4;
  ctx.beginPath();
  ctx.moveTo(40, topBoxY + tRowH);
  ctx.lineTo(width - 40, topBoxY + tRowH);
  ctx.moveTo(40, topBoxY + tRowH * 2);
  ctx.lineTo(width - 40, topBoxY + tRowH * 2);
  ctx.moveTo(40, topBoxY + tRowH * 3);
  ctx.lineTo(width - 40, topBoxY + tRowH * 3);
  ctx.moveTo(splitX, topBoxY);
  ctx.lineTo(splitX, topBoxY + topBoxH);
  ctx.stroke();

  ctx.textAlign = 'left';

  // Row 1: Truck No
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.fillText('गाड़ी नं0 / TRUCK NO.', 52, topBoxY + 24);
  ctx.font = `bold 20px ${FONT_FAMILY}`;
  ctx.fillText(String(v.truckNo || '—').toUpperCase(), splitX + 16, topBoxY + 25);

  // Row 2: LR No & Driver
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.fillText('एल.आर. नं0 / LR NO.', 52, topBoxY + tRowH + 24);
  ctx.font = `bold 18px ${FONT_FAMILY}`;
  const lrLabel = (v.deliveries && v.deliveries.length > 0)
    ? v.deliveries.map(d => d.lrNo).filter(Boolean).join(', ') || String(v.lrNo || '—')
    : String(v.lrNo || '—');
  ctx.fillText(lrLabel, splitX + 16, topBoxY + tRowH + 25);

  // Row 3: Party & Destination
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.fillText('पार्टी / गंतव्य / DEST.', 52, topBoxY + tRowH * 2 + 24);
  ctx.font = `bold 18px ${FONT_FAMILY}`;
  const partyDest = `${v.partyName || '—'}${v.destination ? ' (' + v.destination + ')' : ''}`;
  ctx.fillText(partyDest.length > 32 ? partyDest.slice(0, 30) + '...' : partyDest, splitX + 16, topBoxY + tRowH * 2 + 25);

  // Row 4: Weight & Rate
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.fillText('वजन व दर / WT & RATE', 52, topBoxY + tRowH * 3 + 24);
  ctx.font = `bold 18px ${FONT_FAMILY}`;
  ctx.fillText(`${weight.toFixed(2)} MT @ ₹${rate} / MT`, splitX + 16, topBoxY + tRowH * 3 + 25);

  curY += topBoxH + 25;

  // Table 2: Financial Particulars
  const tableY = curY;
  const headerH = 42;
  const totalRowH = 42;
  const tableH = headerH + (rows.length * itemRowH) + totalRowH;

  ctx.strokeRect(40, tableY, width - 80, tableH);

  // Table header
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(40, tableY, width - 80, headerH);
  ctx.fillStyle = '#000000';

  ctx.beginPath();
  ctx.moveTo(40, tableY + headerH);
  ctx.lineTo(width - 40, tableY + headerH);

  const colSep = width - 215;
  ctx.moveTo(colSep, tableY);
  ctx.lineTo(colSep, tableY + tableH);
  ctx.stroke();

  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('विवरण / PARTICULAR', 52, tableY + 27);

  ctx.textAlign = 'right';
  ctx.fillText('राशि / AMOUNT (₹)', width - 52, tableY + 27);

  let rowY = tableY + headerH;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    ctx.beginPath();
    ctx.moveTo(40, rowY + itemRowH);
    ctx.lineTo(width - 40, rowY + itemRowH);
    ctx.stroke();

    ctx.font = r.isCredit ? `bold 15px ${FONT_FAMILY}` : `14px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.fillText(r.label, 52, rowY + 26);

    ctx.textAlign = 'right';
    ctx.font = `bold 15px ${FONT_FAMILY}`;
    const sign = r.isCredit ? '' : '- ';
    ctx.fillText(`${sign}₹ ${r.val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, width - 52, rowY + 26);

    rowY += itemRowH;
  }

  // Total Deductions row
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(40, rowY, width - 80, totalRowH);
  ctx.fillStyle = '#000000';

  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('कुल कटौती / TOTAL DEDUCTIONS', 52, rowY + 27);

  ctx.textAlign = 'right';
  ctx.fillText(`- ₹ ${totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, width - 52, rowY + 27);

  // Prominent Net Balance Box
  const netBoxY = tableY + tableH + 18;
  const netBoxH = 65;
  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect(40, netBoxY, width - 80, netBoxH);

  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, netBoxY, width - 80, netBoxH);

  ctx.fillStyle = '#065f46';
  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('कुल शेष भाड़ा / NET BALANCE PAYABLE', 55, netBoxY + 39);

  ctx.textAlign = 'right';
  ctx.font = `bold 24px ${FONT_FAMILY}`;
  ctx.fillText(`₹ ${net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, width - 55, netBoxY + 41);

  curY = netBoxY + netBoxH + 35;

  // Signatures
  const sigLineY = curY + 45;
  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  ctx.moveTo(40, sigLineY);
  ctx.lineTo(250, sigLineY);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('चालक / DRIVER', 60, sigLineY + 25);

  // Auth box
  const boxW = 250;
  const boxH = 95;
  const boxX = width - 40 - boxW;
  const boxY = curY;

  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.font = `bold 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('हस्ताक्षर / SIGNATURE', boxX + boxW / 2, boxY + 22);

  ctx.font = 'italic bold 24px cursive, "Brush Script MT", sans-serif';
  ctx.fillText('Vikas Admin', boxX + boxW / 2, boxY + 54);

  ctx.font = `bold 12px ${FONT_FAMILY}`;
  ctx.fillText('Auth. Signatory', boxX + boxW / 2, boxY + 78);

  return canvas.toBuffer('image/png');
}

// ─── Event notification dispatcher ────────────────────────────────────────────

/**
 * High-level helper — resolves the template for `eventKey`, interpolates
 * `data`, and sends to every phone in `phones`. Silently skips empty phones.
 * Never throws (fire-and-forget safe).
 *
 * @param {string}   eventKey  One of: lr_created|voucher_created|balance_paid|cashout|deposit|lr_loading_labour|online_advance_clerk
 * @param {object}   data      Placeholder values for template interpolation
 * @param {string[]} phones    Array of phone numbers to send to
 * @param {object}   req       Express request (for org context)
 */
async function sendEventNotification(eventKey, data, phones, req) {
  try {
    const config = await getWhatsAppConfig(req);
    if (!config.enabled) {
      console.log(`[WA] ${eventKey}: notification skipped — WhatsApp is disabled in system config`);
      return;
    }
    if (!config.phoneNumberId || !config.accessToken) {
      console.log(`[WA] ${eventKey}: notification skipped — Meta Cloud API credentials not configured in settings`);
      return;
    }

    const eventCfg = (config.events || {})[eventKey] || DEFAULT_TEMPLATES[eventKey];
    if (!eventCfg || eventCfg.enabled === false) {
      console.log(`[WA] ${eventKey}: notification skipped — template event is disabled`);
      return;
    }

    const validPhones = (phones || []).filter(p => p && String(p).trim());
    if (!validPhones.length) {
      console.log(`[WA] ${eventKey}: no valid recipient phones — skipping`);
      return;
    }

    const botPhone = await discoverBotPhoneNumber(config);

    for (const phone of validPhones) {
      try {
        let actionButtons = null;

        if (eventKey === 'lr_loading_labour') {
          const lrIdentifier = data.lrNo || data.loadingNo || '';
          actionButtons = [
            { id: `LOADED_${lrIdentifier}`, text: '✅ Mark Loaded' }
          ];
        } else if (eventKey === 'online_advance_clerk' || eventKey === 'online_advance_pending_reminder') {
          const voucherIdentifier = data.voucherNo || data.entryId || data.id || '';
          actionButtons = [
            { id: `PAID_${voucherIdentifier}`, text: '✅ Mark PAID' }
          ];
        }

        const message = interpolateTemplate(eventCfg.template || '', data);

        if (actionButtons && actionButtons.length > 0) {
          await sendWhatsAppButtons(phone, 'ACTION REQUIRED', message, actionButtons, req);
        } else {
          await sendWhatsAppMessage(phone, message, req);
        }
        console.log(`[WA] ${eventKey} → ${phone}: sent via Meta Cloud API`);
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

async function startWhatsAppSession(req = null) {
  // Meta Cloud API is cloud-hosted and does not require local browser session startup
  return { ok: true, provider: 'meta', message: 'Meta Cloud API runs 24/7 in the cloud without session QR startup.' };
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  checkWhatsAppStatus,
  sendWhatsAppMessage,
  sendWhatsAppButtons,
  sendWhatsAppPoll,
  sendMetaTemplate,
  sendOpenWATemplate,
  sendWhatsAppImage,
  sendWhatsAppDocument,
  broadcastToAdmins,
  generateLrReceiptImageBuffer,
  generateVoucherImageBuffer,
  startWhatsAppSession,
  sendEventNotification,
  triggerEventWhatsApp: (eventKey, data, req) => sendEventNotification(eventKey, data, [data.ownerContact || data.driverContact], req),
  generateLrReceiptHtml,
  generateVoucherHtml,
  previewTemplate,
  lookupVehicleInfo,
  lookupVehiclePhone,
  lookupProfilePhone,
  lookupUserPhone,
  formatMetaPhone,
  formatPhoneWid,
  discoverBotPhoneNumber,
  getPublicActionBaseUrl,
  logWhatsAppActivity,
  getWhatsAppLogs,
  clearWhatsAppLogs,
  DEFAULT_TEMPLATES
};
