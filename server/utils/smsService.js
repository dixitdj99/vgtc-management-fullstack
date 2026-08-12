const axios = require('axios');
const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');

const SMS_CONFIG_COL = 'system_settings';
const SMS_CONFIG_DOC_ID = 'sms_gateway_config';

const DEFAULT_TEMPLATES = {
    lr_created: 'VGTC SMS: LR #{lrNo} generated for Truck {truckNo}. Qty: {qty} Bags, Destination: {destination}.',
    voucher_created: 'VGTC SMS: Voucher #{voucherNo} generated for Truck {truckNo}. Freight: Rs.{freight}.',
    balance_paid: 'VGTC SMS: Balance payment of Rs.{amount} paid for Truck {truckNo}.',
    cashout: 'VGTC SMS: Cash Out of Rs.{amount} given to {entityName}. Remark: {remark}.',
    deposit: 'VGTC SMS: Deposit of Rs.{amount} received into Cashbook.'
};

const getSmsConfig = async (req = null) => {
    try {
        let config = null;
        if (!isAvailable()) {
            config = localStore.getById(SMS_CONFIG_COL, SMS_CONFIG_DOC_ID);
        } else if (req) {
            const doc = await db.collection(`orgs/${req.orgId}/${SMS_CONFIG_COL}`).doc(SMS_CONFIG_DOC_ID).get();
            if (doc.exists) config = doc.data();
        }
        if (!config) {
            config = {
                enabled: true,
                gatewayUrl: '',
                apiKey: '',
                events: {
                    lr_created: { enabled: true, template: DEFAULT_TEMPLATES.lr_created },
                    voucher_created: { enabled: true, template: DEFAULT_TEMPLATES.voucher_created },
                    balance_paid: { enabled: true, template: DEFAULT_TEMPLATES.balance_paid },
                    cashout: { enabled: true, template: DEFAULT_TEMPLATES.cashout },
                    deposit: { enabled: true, template: DEFAULT_TEMPLATES.deposit }
                }
            };
        }
        return config;
    } catch {
        return {};
    }
};

const saveSmsConfig = async (config, req = null) => {
    if (!isAvailable()) {
        localStore.insert(SMS_CONFIG_COL, { id: SMS_CONFIG_DOC_ID, ...config });
    } else if (req) {
        await db.collection(`orgs/${req.orgId}/${SMS_CONFIG_COL}`).doc(SMS_CONFIG_DOC_ID).set(config, { merge: true });
    }
    return config;
};

// Map to hold active SSE streams to push real-time alerts instantly
const sseClients = new Map(); // orgId -> Array of res objects

const sendSms = async ({ phone, message, req = null }) => {
    if (!phone || !message) throw new Error('Phone and message required');
    const orgId = req ? req.orgId : 'default';

    const queueData = {
        phone,
        message,
        status: 'pending',
        orgId,
        createdAt: new Date().toISOString(),
        attempts: 0
    };

    let docId = `sms-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    if (isAvailable()) {
        const docRef = await db.collection(`orgs/${orgId}/sms_queue`).add(queueData);
        docId = docRef.id;
    } else {
        const doc = localStore.insert('sms_queue', queueData);
        docId = doc.id;
    }
    queueData.id = docId;

    // 1. If Local Network Gateway URL is configured, try sending directly (Real-time LAN)
    const config = await getSmsConfig(req);
    if (config.gatewayUrl) {
        try {
            axios.post(`${config.gatewayUrl.replace(/\/$/, '')}/send`, {
                phone, message
            }, { timeout: 3000 }).then(async () => {
                if (isAvailable()) {
                    await db.collection(`orgs/${orgId}/sms_queue`).doc(docId).update({ status: 'sent', sentAt: new Date().toISOString() });
                } else {
                    localStore.update('sms_queue', docId, { status: 'sent', sentAt: new Date().toISOString() });
                }
            }).catch(e => {
                console.warn('[SMS Local Gateway] Failed direct post:', e.message);
            });
        } catch (err) {
            console.warn('[SMS Local Gateway] Direct POST error:', err.message);
        }
    }

    // 2. Real-time Cloud Push: If we have connected SSE clients for this org, push the message instantly
    const clients = sseClients.get(orgId) || [];
    if (clients.length > 0) {
        const payload = JSON.stringify(queueData);
        clients.forEach(client => {
            client.write(`data: ${payload}\n\n`);
        });
    }

    return { id: docId, ...queueData };
};

const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    let p = String(phone).replace(/\D/g, '');
    if (p.length === 10) p = '91' + p;
    return p;
};

const triggerEventSms = async (eventKey, data, req = null) => {
    console.log(`[SMS Debug] triggerEventSms called for key: ${eventKey}`);
    const config = await getSmsConfig(req);
    console.log('[SMS Debug] Config loaded:', JSON.stringify(config));
    if (!config.enabled) {
        console.log('[SMS Debug] SMS gateway is disabled in config.');
        return;
    }
    const evt = config.events?.[eventKey];
    if (!evt) {
        console.log(`[SMS Debug] No event config found for: ${eventKey}`);
        return;
    }
    if (!evt.enabled) {
        console.log(`[SMS Debug] Event ${eventKey} is disabled.`);
        return;
    }
    if (!evt.template) {
        console.log(`[SMS Debug] No template defined for: ${eventKey}`);
        return;
    }

    let phone = data.driverMobile || data.driverPhone || data.partyPhone || data.mobile || data.phone || '';
    if (eventKey === 'cashout' || eventKey === 'deposit') {
        phone = data.entityMobile || data.driverPhone || data.phone || '';
    }

    console.log(`[SMS Debug] Resolved phone number: "${phone}"`);
    if (!phone) {
        console.log('[SMS Debug] Skipped sending: No phone number resolved.');
        return;
    }

    let template = evt.template;
    Object.entries(data).forEach(([key, val]) => {
        template = template.replace(new RegExp(`{${key}}`, 'g'), val || '');
    });

    console.log(`[SMS Debug] Prepared message: "${template}"`);
    try {
        await sendSms({ phone, message: template, req });
        console.log('[SMS Debug] Message enqueued successfully.');
    } catch (err) {
        console.error('[SMS Debug] Error enqueuing message:', err.message);
    }
};

module.exports = {
    getSmsConfig,
    saveSmsConfig,
    sendSms,
    formatPhoneNumber,
    triggerEventSms,
    DEFAULT_TEMPLATES,
    sseClients
};
