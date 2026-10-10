const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

let user = { role: 'admin' };
let conversation = { phone: '919999999999', lastInboundAt: new Date().toISOString() };
const sends = [];
stub('../middleware/auth', {
  requireAuth: (_req, _res, next) => next(),
  permits: (candidate, key, action) => candidate.role === 'admin' || candidate.permissions?.[key] === action
});
stub('../utils/whatsappDeliveryStore', { getDelivery: async () => null, getRecentDeliveries: async () => [] });
stub('../utils/whatsappInboxStore', {
  normalizePhone: value => String(value || '').replace(/\D/g, ''),
  listConversations: async () => [conversation],
  getMessages: async () => [],
  markRead: async () => ({ ...conversation, unreadCount: 0 }),
  getConversation: async () => conversation,
  canReply: item => Date.now() - Date.parse(item?.lastInboundAt || '') < 86400000
});
stub('../utils/whatsappService', {
  sendWhatsAppMessage: async (...args) => { sends.push(args); return { messages: [{ id: 'wamid-reply' }] }; }
});

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = user; next(); });
app.use('/api/whatsapp', require('../routes/whatsappRoutes'));
let server;
let base;
test.before(async () => {
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/api/whatsapp`;
});
test.after(async () => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => {
  sends.length = 0;
  user = { role: 'admin' };
  conversation = { phone: '919999999999', lastInboundAt: new Date().toISOString() };
});

test('inbox requires WhatsApp permission', async () => {
  user = { role: 'staff', permissions: {} };
  assert.equal((await fetch(`${base}/conversations`)).status, 403);
  assert.equal((await fetch(`${base}/conversations/919999999999/reply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Hello' })
  })).status, 403);
  assert.equal(sends.length, 0);
});

test('reply bypasses automation toggle only within customer service window', async () => {
  const send = () => fetch(`${base}/conversations/919999999999/reply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Hello' })
  });
  conversation.lastInboundAt = new Date(Date.now() - 86400001).toISOString();
  assert.equal((await send()).status, 409);
  assert.equal(sends.length, 0);
  conversation.lastInboundAt = new Date().toISOString();
  assert.equal((await send()).status, 200);
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0][3], { bypassEnabledCheck: true });
});
