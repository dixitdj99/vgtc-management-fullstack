const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { captureMetaWebhookBody, verifyMetaWebhookSignature } = require('../middleware/metaWebhookSignature');

const priorSecret = process.env.META_APP_SECRET;
const app = express();
app.use(express.json({ verify: captureMetaWebhookBody }));
app.use('/api/whatsapp/webhook', verifyMetaWebhookSignature);
app.get('/api/whatsapp/webhook', (_req, res) => res.send('challenge'));
app.post('/api/whatsapp/webhook', (_req, res) => res.send('accepted'));

let server;
let endpoint;
test.before(async () => {
    server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    endpoint = `http://127.0.0.1:${server.address().port}/api/whatsapp/webhook`;
});
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (priorSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = priorSecret;
});

test('accepts signed exact Meta body and preserves GET challenge', async () => {
    process.env.META_APP_SECRET = 'test-meta-secret';
    assert.equal((await fetch(endpoint)).status, 200);
    const body = '{"entry":[]}';
    const signature = crypto.createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex');
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` },
        body
    });
    assert.equal(response.status, 200);
});

test('rejects unsigned and altered bodies', async () => {
    process.env.META_APP_SECRET = 'test-meta-secret';
    const body = '{"entry":[]}';
    const signature = crypto.createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex');
    const unsigned = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(unsigned.status, 403);
    const altered = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` },
        body: '{"entry":[1]}'
    });
    assert.equal(altered.status, 403);
});

test('rejects POST when Meta app secret is missing', async () => {
    delete process.env.META_APP_SECRET;
    const response = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(response.status, 503);
});
