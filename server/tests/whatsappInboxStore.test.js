const test = require('node:test');
const assert = require('node:assert/strict');

function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const data = new Map();
let firestoreAvailable = false;
const rows = name => data.get(name) || new Map();
const put = (name, id, value) => {
  if (!data.has(name)) data.set(name, new Map());
  data.get(name).set(id, value);
};
const db = {
  collection: name => ({
    doc: id => ({
      get: async () => ({ exists: rows(name).has(id), data: () => rows(name).get(id) }),
      update: async patch => put(name, id, { ...rows(name).get(id), ...patch }),
      name, id
    }),
    get: async () => ({ docs: [...rows(name).values()].map(value => ({ data: () => value })) }),
    where: (_key, _op, phone) => ({ get: async () => ({
      docs: [...rows(name).values()].filter(value => value.phone === phone).map(value => ({ data: () => value }))
    }) })
  }),
  runTransaction: async callback => callback({
    get: ref => ref.get(),
    set: (ref, value) => put(ref.name, ref.id, value),
    update: (ref, patch) => put(ref.name, ref.id, { ...rows(ref.name).get(ref.id), ...patch })
  })
};
stub('../firebase', { db, isAvailable: () => firestoreAvailable });
stub('../utils/collectionUtils', { getEnvCol: name => `dev_${name}` });
stub('../utils/localStore', {
  getAll: name => [...rows(name).values()],
  getById: (name, id) => rows(name).get(id) || null,
  upsert: (name, id, value) => { put(name, id, { ...rows(name).get(id), ...value }); return rows(name).get(id); },
  update: (name, id, value) => { put(name, id, { ...rows(name).get(id), ...value }); return rows(name).get(id); }
});

const inbox = require('../utils/whatsappInboxStore');

test.beforeEach(() => { data.clear(); firestoreAvailable = false; });

for (const backend of ['local', 'firestore']) {
  test(`${backend}: stores incoming replies once, tracks unread and outgoing`, async () => {
    firestoreAvailable = backend === 'firestore';
    const incoming = { id: 'wamid-in-1', from: '919999999999', type: 'text', text: { body: 'Need invoice' }, timestamp: '1791560000' };
    assert.equal((await inbox.saveInbound(incoming, { profile: { name: 'Ravi' } })).inserted, true);
    assert.equal((await inbox.saveInbound(incoming)).inserted, false);
    let [conversation] = await inbox.listConversations();
    assert.equal(conversation.name, 'Ravi');
    assert.equal(conversation.unreadCount, 1);
    const result = { messages: [{ id: 'wamid-out-1' }] };
    assert.equal((await inbox.saveOutbound(result, incoming.from, { text: 'Sent', type: 'text' })).inserted, true);
    assert.equal((await inbox.saveOutbound(result, incoming.from, { text: 'Sent', type: 'text' })).inserted, false);
    assert.equal((await inbox.getMessages(incoming.from)).length, 2);
    await inbox.markRead(incoming.from);
    [conversation] = await inbox.listConversations();
    assert.equal(conversation.unreadCount, 0);
    assert.equal(conversation.phone, incoming.from);
    assert.equal(conversation.name, 'Ravi');
    assert.ok(conversation.lastInboundAt);
    await inbox.updateStatus({ id: 'wamid-out-1', status: 'delivered' });
    assert.equal((await inbox.getMessages(incoming.from)).find(item => item.metaId === 'wamid-out-1').status, 'delivered');
  });
}

test('captures button replies and media placeholders without exposing raw webhook payload', () => {
  const button = inbox.extractInbound({ id: 'a', from: '+91 99999 99999', type: 'interactive',
    interactive: { button_reply: { id: 'paid', title: 'Mark paid' } } }, null);
  assert.equal(button.text, 'Mark paid');
  const document = inbox.extractInbound({ id: 'b', from: '919999999999', type: 'document',
    document: { id: 'media-1', filename: 'invoice.pdf', mime_type: 'application/pdf' } }, null);
  assert.equal(document.text, '[invoice.pdf]');
  assert.equal(document.mediaId, 'media-1');
});

test('manual reply window closes after 24 hours', () => {
  const now = Date.parse('2026-10-10T12:00:00.000Z');
  assert.equal(inbox.canReply({ lastInboundAt: '2026-10-09T12:00:01.000Z' }, now), true);
  assert.equal(inbox.canReply({ lastInboundAt: '2026-10-09T12:00:00.000Z' }, now), false);
  assert.equal(inbox.canReply({ lastInboundAt: '2026-10-09T11:59:59.000Z' }, now), false);
  assert.equal(inbox.canReply({ lastInboundAt: '2026-10-10T12:00:01.000Z' }, now), false);
  assert.equal(inbox.canReply(null, now), false);
});
