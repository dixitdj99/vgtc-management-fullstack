const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { setTimeout: delay } = require('node:timers/promises');

// Load the router against inert dependencies. No network, Firestore, or real
// WhatsApp request should be needed to prove message dispatch behavior.
function stub(modulePath, exports) {
    const id = require.resolve(modulePath);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}

const aiCalls = [];
const sent = [];
stub('../firebase', { db: {}, isAvailable: () => false, admin: {} });
stub('../utils/collectionUtils', { getCol: name => name, getEnvCol: name => name });
stub('../utils/localStore', { getAll: () => [], _store: {} });
stub('../utils/notificationService', { createNotification: async () => {} });
stub('../services/reportService', {
    generateVehicleMonthlyPdf: async () => {},
    generateVehicleMonthlyExcel: async () => {},
    fetchVouchersForTruck: async () => [],
    computeVoucherFinancials: () => ({}),
});
stub('../utils/whatsappService', {
    sendWhatsAppMessage: async (phone, body) => { sent.push({ phone, body }); },
    sendWhatsAppDocument: async () => {},
    sendWhatsAppButtons: async () => {},
    broadcastToAdmins: async () => {},
    sendEventNotification: async () => {},
    lookupVehicleInfo: async truck => truck === 'HR55AA1234' ? { ownerContact: '919777777777', driverContact: '' } : null,
    lookupVehiclePhone: async () => '',
    lookupProfilePhone: async () => '',
    lookupUserPhone: async () => '',
    getWhatsAppConfig: async () => ({ clerkPhone: '919999999999', labourPhones: '919999999999', adminPhones: [], webhookVerifyToken: 'test-verify-token' }),
    logWhatsAppActivity: () => {},
});
stub('../services/whatsappAiService', {
    isAiEnabled: () => true,
    generateAiReply: async args => { aiCalls.push(args); return 'AI test answer'; },
});

const router = require('../routes/whatsappWebhookRoute');
const app = express();
app.use(express.json());
app.use('/webhook', router);

let server;
let baseUrl;

test.before(async () => {
    server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/webhook`;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
});

test.beforeEach(() => {
    aiCalls.length = 0;
    sent.length = 0;
});

async function post(body) {
    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
}

async function settle() {
    // Webhook ACKs before its asynchronous dispatch completes.
    await delay(40);
}

async function waitFor(predicate) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) return;
        await delay(10);
    }
    assert.fail('Webhook did not finish expected asynchronous dispatch');
}

function metaMessage(message) {
    return { entry: [{ changes: [{ value: { messages: [message] } }] }] };
}

test('Meta webhook challenge requires configured verify token', async () => {
    const valid = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345`);
    assert.equal(valid.status, 200);
    assert.equal(await valid.text(), '12345');

    const invalid = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
    assert.equal(invalid.status, 403);
});

test('ordinary Meta text reaches Gemini and replies to sender', async () => {
    await post(metaMessage({ id: 'wamid-ai-1', from: '919999999999', type: 'text', text: { body: 'What are your working hours?' } }));
    await waitFor(() => sent.length === 1);

    assert.deepEqual(aiCalls, [{ phone: '919999999999', message: 'What are your working hours?' }]);
    assert.deepEqual(sent, [{ phone: '919999999999', body: 'AI test answer' }]);
});

test('existing HELP command takes priority over Gemini', async () => {
    await post(metaMessage({ id: 'wamid-help-1', from: '919999999999', type: 'text', text: { body: 'HELP' } }));
    await waitFor(() => sent.length === 1);

    assert.equal(aiCalls.length, 0);
    assert.equal(sent.length, 1);
    assert.match(sent[0].body, /Your WhatsApp Assistant/);
    assert.match(sent[0].body, /Ask in English or Hindi/);
    assert.match(sent[0].body, /Show recent trips/);
});

test('greeting with a question reaches Gemini instead of dropping the question', async () => {
    await post(metaMessage({ id: 'wamid-greeting-question', from: '919999999999', type: 'text', text: { body: 'Hi, what can you help me with?' } }));
    await waitFor(() => sent.length === 1);

    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].message, 'Hi, what can you help me with?');
    assert.equal(sent[0].body, 'AI test answer');
});

test('natural-language trip request without truck asks for vehicle', async () => {
    await post(metaMessage({ id: 'wamid-trip-no-truck', from: '919999999999', type: 'text', text: { body: 'Recent trips' } }));
    await waitFor(() => sent.length === 1);

    assert.equal(aiCalls.length, 0);
    assert.match(sent[0].body, /Which vehicle/);
});

test('pending challans question is handled instead of discarded', async () => {
    await post(metaMessage({ id: 'wamid-pending-challans', from: '919999999999', type: 'text', text: { body: 'Show my pending challans' } }));
    await waitFor(() => sent.length === 1);

    assert.equal(aiCalls.length, 0);
    assert.match(sent[0].body, /Which vehicle/);
});

test('explicit PAID and LOADED commands never enter Gemini', async () => {
    await post(metaMessage({ id: 'wamid-paid-1', from: '919999999999', type: 'text', text: { body: 'PAID_123' } }));
    await post(metaMessage({ id: 'wamid-loaded-1', from: '919999999999', type: 'text', text: { body: 'LOADED_456' } }));
    await settle();

    assert.equal(aiCalls.length, 0);
});

test('natural-language balance request uses existing vehicle handler for registered owner', async () => {
    await post(metaMessage({ id: 'wamid-balance-1', from: '919777777777', type: 'text', text: { body: 'What is balance for HR55AA1234?' } }));
    await settle();

    assert.equal(aiCalls.length, 0);
    assert.match(sent[0].body, /No voucher records found/);
});

test('Hindi vehicle question uses authorized records handler', async () => {
    await post(metaMessage({ id: 'wamid-hindi-balance', from: '919777777777', type: 'text', text: { body: 'मेरे HR55AA1234 का हिसाब दिखाओ' } }));
    await waitFor(() => sent.length === 1);

    assert.equal(aiCalls.length, 0);
    assert.match(sent[0].body, /No voucher records found/);
});

test('payment action refuses an unregistered sender', async () => {
    await post(metaMessage({ id: 'wamid-paid-unauthorized', from: '919888888888', type: 'text', text: { body: 'PAID_123' } }));
    await settle();

    assert.equal(aiCalls.length, 0);
    assert.match(sent[0].body, /not authorized to mark online advances paid/);
});

test('vehicle data request refuses an unregistered sender', async () => {
    await post(metaMessage({ id: 'wamid-balance-2', from: '919888888888', type: 'text', text: { body: 'BALANCE HR55AA1234' } }));
    await settle();

    assert.equal(aiCalls.length, 0);
    assert.match(sent[0].body, /not registered for that vehicle/);
});

test('interactive button payload never enters Gemini fallback', async () => {
    await post(metaMessage({ id: 'wamid-button-1', from: '919999999999', type: 'interactive', interactive: { button_reply: { id: 'UNKNOWN_BUTTON', title: 'Unknown' } } }));
    await settle();

    assert.equal(aiCalls.length, 0);
    assert.equal(sent.length, 0);
});

test('Meta delivery status and legacy fromMe event receive no AI reply', async () => {
    await post({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid-status-1', status: 'delivered' }] } }] }] });
    await post({ fromMe: true, from: '919999999999', body: 'What are your working hours?' });
    await settle();

    assert.equal(aiCalls.length, 0);
    assert.equal(sent.length, 0);
});

test('duplicate Meta message ID receives one AI reply', async () => {
    const body = metaMessage({ id: 'wamid-ai-duplicate', from: '919999999999', type: 'text', text: { body: 'Tell me about VGTC' } });
    await post(body);
    await post(body);
    await waitFor(() => sent.length === 1);
    await settle();

    assert.equal(aiCalls.length, 1);
    assert.equal(sent.length, 1);
});
