const axios = require('axios');
const { db, isAvailable } = require('../firebase');
const { getCol } = require('./collectionUtils');
const localStore = require('./localStore');

const CONFIG_COL = 'whatsapp_config';
const CONFIG_DOC_ID = 'gateway';

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
    return cfg || {
      enabled: true,
      gatewayUrl: '',
      apiKey: '',
      payloadFormat: 'openwa',
      events: {
        lr_created: { enabled: true, template: 'VGTC Alert: LR #{lrNo} generated for Truck {truckNo}. Qty: {qty} Bags, Destination: {destination}. Party: {partyName}.' },
        voucher_created: { enabled: true, template: 'VGTC Alert: Voucher #{voucherNo} generated for Truck {truckNo}. Freight: Rs.{freight}, Advance: Rs.{advance}. Driver: {driverName}.' },
        balance_paid: { enabled: true, template: 'VGTC Payment: Balance payment of Rs.{amount} paid for Truck {truckNo} (Batch #{batchNo}). Status: PAID.' },
        cashout: { enabled: true, template: 'VGTC Cashbook: Cash Out of Rs.{amount} given to {entityName} ({entityType}). Remark: {remark}. Date: {date}.' },
        deposit: { enabled: true, template: 'VGTC Cashbook: Deposit of Rs.{amount} received into Cashbook. Remark: {remark}. Date: {date}.' }
      }
    };
  } catch (e) {
    return { enabled: false, gatewayUrl: '', apiKey: '' };
  }
}

async function saveWhatsAppConfig(config, req = null) {
  const payload = {
    ...config,
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

function formatPhoneWid(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  if (!cleaned.endsWith('@c.us') && !cleaned.endsWith('@g.us')) {
    cleaned = cleaned + '@c.us';
  }
  return cleaned;
}

async function checkWhatsAppStatus(req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.gatewayUrl) {
    return { connected: false, message: 'Gateway URL not configured' };
  }

  const baseUrl = config.gatewayUrl.replace(/\/+$/, '');
  
  try {
    const res = await axios.get(`${baseUrl}/api/health/ready`, {
      timeout: 5000,
      headers: config.apiKey ? { 'x-api-key': config.apiKey, 'Authorization': `Bearer ${config.apiKey}` } : {}
    });
    if (res.status === 200) {
      return { connected: true, message: 'OpenWA Gateway Online & Ready' };
    }
  } catch (err) {
    try {
      const res = await axios.get(`${baseUrl}/api/sessions`, {
        timeout: 5000,
        headers: config.apiKey ? { 'x-api-key': config.apiKey, 'Authorization': `Bearer ${config.apiKey}` } : {}
      });
      if (res.status === 200) {
        return { connected: true, message: 'OpenWA Gateway Online' };
      }
    } catch (e) {
      return { connected: false, message: err.message || 'Gateway Unreachable' };
    }
  }

  return { connected: false, message: 'Gateway Offline' };
}

async function sendWhatsAppMessage(phone, message, req = null) {
  const config = await getWhatsAppConfig(req);
  if (!config.enabled) {
    throw new Error('WhatsApp dispatch is disabled in Control Module settings');
  }
  if (!config.gatewayUrl) {
    throw new Error('WhatsApp Gateway URL is not configured');
  }

  const baseUrl = config.gatewayUrl.replace(/\/+$/, '');
  const chatId = formatPhoneWid(phone);

  if (!chatId) {
    throw new Error('Invalid phone number provided for WhatsApp dispatch');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['x-api-key'] = config.apiKey;
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const payload = {
    chatId: chatId,
    text: message
  };

  let response;
  try {
    response = await axios.post(`${baseUrl}/api/sessions/default/messages/send-text`, payload, {
      headers,
      timeout: 10000
    });
  } catch (err) {
    try {
      response = await axios.post(`${baseUrl}/api/messages/send-text`, payload, {
        headers,
        timeout: 10000
      });
    } catch (err2) {
      try {
        response = await axios.post(`${baseUrl}/send`, { to: phone, message }, {
          headers,
          timeout: 10000
        });
      } catch (err3) {
        throw new Error(err.response?.data?.message || err.message || 'Failed to dispatch message via OpenWA');
      }
    }
  }

  return response.data;
}

module.exports = {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  checkWhatsAppStatus,
  sendWhatsAppMessage,
  formatPhoneWid
};
