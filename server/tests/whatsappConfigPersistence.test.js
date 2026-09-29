const test = require('node:test');
const assert = require('node:assert/strict');

const documents = new Map();
let failRead = false;
const db = {
  collection(name) {
    return {
      doc(id) {
        const key = `${name}/${id}`;
        return {
          async get() {
            if (failRead) throw new Error('Firestore unavailable');
            return { exists: documents.has(key), data: () => documents.get(key) };
          },
          async set(value, options) {
            documents.set(key, options?.merge ? { ...documents.get(key), ...value } : value);
          },
        };
      },
    };
  },
};

function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

stub('../firebase', { db, isAvailable: () => true });
stub('../utils/collectionUtils', {
  getCol: () => { throw new Error('WhatsApp settings must not use a user collection'); },
  getEnvCol: name => `dev_${name}`,
});

const { getWhatsAppConfig, saveWhatsAppConfig, setWhatsAppEnabled, checkWhatsAppStatus } = require('../utils/whatsappService');
const sandboxRequest = { user: { isSandbox: true } };

test('saved credentials survive sandbox sessions and outbound toggle', async () => {
  await saveWhatsAppConfig({
    enabled: false,
    phoneNumberId: '1234567890123456',
    wabaId: '9876543210987654',
    accessToken: 'test-access-token-longer-than-twenty-characters',
    webhookVerifyToken: 'test-verify-token',
  });

  assert.equal(documents.size, 1);
  const before = await getWhatsAppConfig(sandboxRequest);
  assert.equal(before.accessToken, 'test-access-token-longer-than-twenty-characters');
  assert.equal(before.phoneNumberId, '1234567890123456');

  await setWhatsAppEnabled(true);
  const after = await getWhatsAppConfig(sandboxRequest);
  assert.equal(after.enabled, true);
  for (const key of ['accessToken', 'phoneNumberId', 'wabaId', 'webhookVerifyToken']) {
    assert.equal(after[key], before[key]);
  }
});

test('storage read failure does not return empty writable settings', async () => {
  failRead = true;
  try {
    await assert.rejects(getWhatsAppConfig(sandboxRequest), /Firestore unavailable/);
  } finally {
    failRead = false;
  }
  assert.equal(documents.get('dev_whatsapp_config/gateway').accessToken, 'test-access-token-longer-than-twenty-characters');
});

test('WhatsApp config route returns saved settings without server environment helpers', async () => {
  stub('../middleware/auth', { requireAuth: (_req, _res, next) => next() });
  const express = require('express');
  const app = express();
  app.use('/api/whatsapp', require('../routes/whatsappRoutes'));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp/config`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.accessToken, 'test-access-token-longer-than-twenty-characters');
    assert.equal(body.phoneNumberId, '1234567890123456');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('invalid Meta token is reported without a misleading phone status', async () => {
  const axios = require('axios');
  const originalGet = axios.get;
  let requests = 0;
  axios.get = async () => {
    requests += 1;
    const error = new Error('Meta rejected token');
    error.response = { status: 400, data: { error: { code: 190, message: 'The access token could not be decrypted' } } };
    throw error;
  };
  try {
    const result = await checkWhatsAppStatus(sandboxRequest);
    assert.equal(result.connected, false);
    assert.equal(result.reason, 'invalid_token');
    assert.match(result.message, /Replace it in Credentials/);
    assert.equal(requests, 1);
  } finally {
    axios.get = originalGet;
  }
});
