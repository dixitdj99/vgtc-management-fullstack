/**
 * whatsappService.js — WhatsApp Gateway Integration for VGTC Management.
 *
 * Sends WhatsApp notifications via HTTP-based WhatsApp Gateways (e.g. UltraMsg, Baileys HTTP Gateway,
 * WPPConnect, GreenAPI, Twilio WhatsApp, or custom HTTP WhatsApp Bridges).
 */

const axios = require('axios');
const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');

const WA_CONFIG_COL = 'system_settings';
const WA_CONFIG_DOC_ID = 'whatsapp_gateway_config';
const LEGACY_SMS_CONFIG_DOC_ID = 'sms_gateway_config';

const DEFAULT_TEMPLATES = {
    lr_created: 'VGTC Alert: LR #{lrNo} generated for Truck {truckNo}. Qty: {qty} Bags, Destination: {destination}. Party: {partyName}.',
    voucher_created: 'VGTC Alert: Voucher #{voucherNo} generated for Truck {truckNo}. Freight: Rs.{freight}, Advance: Rs.{advance}. Driver: {driverName}.',
    balance_paid: 'VGTC Payment: Balance payment of Rs.{amount} paid for Truck {truckNo} (Batch #{batchNo}). Status: PAID.',
    cashout: 'VGTC Cashbook: Cash Out of Rs.{amount} given to {entityName} ({entityType}). Remark: {remark}. Date: {date}.',
    deposit: 'VGTC Cashbook: Deposit of Rs.{amount} received into Cashbook. Remark: {remark}. Date: {date}.'
};

/**
 * Reads current WhatsApp Gateway configuration from database or localStore.
 */
const getWhatsAppConfig = async (req = null) => {
    try {
        let config = null;

        if (!isAvailable()) {
            config = localStore.getById(WA_CONFIG_COL, WA_CONFIG_DOC_ID) ||
                     localStore.getById(WA_CONFIG_COL, LEGACY_SMS_CONFIG_DOC_ID);
        } else if (req) {
            const doc = await db.collection(`orgs/${req.orgId}/${WA_CONFIG_COL}`).doc(WA_CONFIG_DOC_ID).get();
            if (doc.exists) {
                config = doc.data();
            } else {
                const legacyDoc = await db.collection(`orgs/${req.orgId}/${WA_CONFIG_COL}`).doc(LEGACY_SMS_CONFIG_DOC_ID).get();
                if (legacyDoc.exists) config = legacyDoc.data();
            }
        }

        if (!config) {
            config = {
                enabled: true,
                gatewayUrl: '',
                apiKey: '',
                cloudToken: '',
                deviceModel: 'WhatsApp HTTP Gateway',
                payloadFormat: 'standard', // 'standard', 'ultramsg', 'wppconnect', 'termux'
                events: {
                    lr_created: { enabled: true, template: DEFAULT_TEMPLATES.lr_created },
                    voucher_created: { enabled: true, template: DEFAULT_TEMPLATES.voucher_created },
                    balance_paid: { enabled: true, template: DEFAULT_TEMPLATES.balance_paid },
                    cashout: { enabled: true, template: DEFAULT_TEMPLATES.cashout },
                    deposit: { enabled: true, template: DEFAULT_TEMPLATES.deposit }
                }
            };
            if (!isAvailable()) {
                localStore.upsert(WA_CONFIG_COL, WA_CONFIG_DOC_ID, config);
            }
        }
        return config;
    } catch (err) {
        console.error('[WhatsApp Service] Failed to read config:', err.message);
        return {
            enabled: true,
            gatewayUrl: '',
            apiKey: '',
            payloadFormat: 'standard',
            events: {
                lr_created: { enabled: true, template: DEFAULT_TEMPLATES.lr_created },
                voucher_created: { enabled: true, template: DEFAULT_TEMPLATES.voucher_created },
                balance_paid: { enabled: true, template: DEFAULT_TEMPLATES.balance_paid },
                cashout: { enabled: true, template: DEFAULT_TEMPLATES.cashout },
                deposit: { enabled: true, template: DEFAULT_TEMPLATES.deposit }
            }
        };
    }
};

/**
 * Saves or updates WhatsApp Gateway configuration.
 */
const saveWhatsAppConfig = async (configData, req = null) => {
    const payload = {
        ...configData,
        updatedAt: new Date().toISOString()
    };

    if (!isAvailable()) {
        localStore.upsert(WA_CONFIG_COL, WA_CONFIG_DOC_ID, payload);
    } else if (req) {
        await db.collection(`orgs/${req.orgId}/${WA_CONFIG_COL}`).doc(WA_CONFIG_DOC_ID).set(payload, { merge: true });
    }
    return payload;
};

/**
 * Formats a phone number for WhatsApp.
 * Converts to international format (+919876543210 or 919876543210 depending on clean input).
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    let clean = String(phone).replace(/[^\d+]/g, '');
    if (clean.startsWith('+')) clean = clean.substring(1);
    if (clean.length === 10) clean = '91' + clean;
    return clean;
};

/**
 * Sends a WhatsApp message via configured HTTP Gateway.
 * @param {Object} params - { phone, message, req }
 */
const sendWhatsAppMessage = async ({ phone, message, req = null }) => {
    const config = await getWhatsAppConfig(req);

    if (!config.gatewayUrl) {
        throw new Error('WhatsApp Gateway URL is not configured. Please set the Gateway URL in Admin → WhatsApp Gateway Settings.');
    }

    const recipient = formatPhoneNumber(phone);
    if (!recipient) {
        throw new Error('Invalid mobile number provided for WhatsApp');
    }

    if (!message || !message.trim()) {
        throw new Error('WhatsApp message content cannot be empty');
    }

    const baseUrl = config.gatewayUrl.replace(/\/$/, '');
    const token = config.apiKey || config.cloudToken || '';
    const textContent = message.trim();

    // Prepare request format variations for different WhatsApp gateway API backends
    const requestsToTry = [];

    if (config.payloadFormat === 'ultramsg') {
        requestsToTry.push({
            url: `${baseUrl}/messages/chat`,
            data: { token, to: `+${recipient}`, body: textContent }
        });
    } else if (config.payloadFormat === 'wppconnect') {
        requestsToTry.push({
            url: `${baseUrl}/api/send-message`,
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            data: { phone: recipient, message: textContent }
        });
    } else {
        // Standard JSON formats for WhatsApp HTTP Gateways / Baileys Bridge / Webhooks
        requestsToTry.push({
            url: baseUrl.endsWith('/send') || baseUrl.endsWith('/message') ? baseUrl : `${baseUrl}/send`,
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            data: { to: recipient, phone: recipient, message: textContent, text: textContent }
        });

        // Fallback root endpoint
        requestsToTry.push({
            url: baseUrl,
            headers: token ? { 'Authorization': token } : {},
            data: { phone: recipient, to: recipient, message: textContent }
        });

        // Form URL Encoded format fallback
        requestsToTry.push({
            url: baseUrl,
            contentType: 'application/x-www-form-urlencoded',
            headers: token ? { 'Authorization': token } : {},
            data: `phone=${encodeURIComponent(recipient)}&message=${encodeURIComponent(textContent)}&token=${encodeURIComponent(token)}`
        });
    }

    let lastError = null;

    for (const reqItem of requestsToTry) {
        try {
            const headers = {
                'Content-Type': reqItem.contentType || 'application/json',
                'User-Agent': 'VGTC-WhatsApp-Gateway/1.0',
                ...(reqItem.headers || {})
            };

            console.log(`[WhatsApp Service] Dispatching message to ${reqItem.url} (Recipient: ${recipient})...`);
            const response = await axios.post(reqItem.url, reqItem.data, { headers, timeout: 10000 });

            console.log(`[WhatsApp Service] Gateway response success:`, response.status, response.data);
            return {
                success: true,
                recipient,
                message: textContent,
                status: response.status,
                gatewayResponse: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            console.warn(`[WhatsApp Service] Dispatch attempt to ${reqItem.url} failed (${err.response?.status || err.message}):`, err.response?.data || '');
            lastError = err;
        }
    }

    const errMsg = lastError?.response?.data?.message || lastError?.response?.data?.error || lastError?.message || 'WhatsApp Gateway error';
    throw new Error(`WhatsApp Gateway Error (${baseUrl}): ${errMsg}`);
};

/**
 * Checks connectivity with the WhatsApp Gateway endpoint.
 */
const checkWhatsAppGatewayStatus = async (req = null) => {
    const config = await getWhatsAppConfig(req);
    if (!config.gatewayUrl) {
        return { connected: false, message: 'WhatsApp Gateway URL is not configured' };
    }

    const targetUrl = config.gatewayUrl.replace(/\/$/, '');
    const pingHeaders = { 'User-Agent': 'VGTC-WhatsApp-Gateway/1.0' };
    if (config.apiKey) pingHeaders['Authorization'] = `Bearer ${config.apiKey}`;

    try {
        const res = await axios.get(targetUrl + '/status', { headers: pingHeaders, timeout: 5000 }).catch(() => null)
                 || await axios.get(targetUrl + '/health', { headers: pingHeaders, timeout: 5000 }).catch(() => null)
                 || await axios.get(targetUrl + '/', { headers: pingHeaders, timeout: 5000 }).catch(() => null);

        if (res && (res.status === 200 || res.status === 204)) {
            return { connected: true, status: res.status, data: res.data || 'Online', config };
        }
        return { connected: false, message: `Gateway HTTP status ${res ? res.status : 'No Response'}`, config };
    } catch (err) {
        return { connected: false, message: err.message, config };
    }
};

/**
 * Triggers an automated event WhatsApp message asynchronously.
 */
const triggerEventWhatsApp = async (eventType, data, req = null) => {
    try {
        const config = await getWhatsAppConfig(req);
        if (!config.enabled) return;

        const eventConfig = config.events?.[eventType];
        if (!eventConfig || !eventConfig.enabled) return;

        const phone = eventConfig.targetPhone || data.phone || data.driverPhone || data.partyPhone;
        if (!phone) return;

        let template = eventConfig.template || DEFAULT_TEMPLATES[eventType] || '';

        Object.keys(data).forEach(key => {
            const val = data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
            template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
        });

        sendWhatsAppMessage({ phone, message: template, req }).catch(err => {
            console.error(`[WhatsApp Event ${eventType}] Error sending to ${phone}:`, err.message);
        });
    } catch (err) {
        console.error(`[WhatsApp Event ${eventType}] Failed to process event:`, err.message);
    }
};

module.exports = {
    getWhatsAppConfig,
    saveWhatsAppConfig,
    sendWhatsAppMessage,
    checkWhatsAppGatewayStatus,
    formatPhoneNumber,
    triggerEventWhatsApp,
    // Aliases for legacy SMS calls
    getSmsConfig: getWhatsAppConfig,
    saveSmsConfig: saveWhatsAppConfig,
    sendSms: sendWhatsAppMessage,
    checkGatewayStatus: checkWhatsAppGatewayStatus,
    triggerEventSms: triggerEventWhatsApp,
    DEFAULT_TEMPLATES
};
