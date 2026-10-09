const test = require('node:test');
const assert = require('node:assert/strict');

function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const documents = new Map();
const localDocuments = new Map();
let firestoreAvailable = false;
const db = {
  collection: name => ({
    doc: id => ({
      key: `${name}/${id}`,
      get: async () => ({ exists: documents.has(`${name}/${id}`), data: () => documents.get(`${name}/${id}`) })
    }),
    orderBy: () => ({ limit: count => ({ get: async () => ({
      docs: [...documents.entries()].filter(([key]) => key.startsWith(`${name}/`))
        .map(([, value]) => ({ data: () => value }))
        .sort((a, b) => b.data().updatedAt.localeCompare(a.data().updatedAt)).slice(0, count)
    }) }) })
  }),
  runTransaction: async fn => fn({
    get: ref => ref.get(),
    set: (ref, value) => documents.set(ref.key, value)
  })
};
stub('../firebase', { db, isAvailable: () => firestoreAvailable });
stub('../utils/collectionUtils', { getEnvCol: name => `dev_${name}` });
stub('../utils/localStore', {
  getById: (_collection, id) => localDocuments.get(id) || null,
  getAll: () => [...localDocuments.values()],
  upsert: (_collection, id, value) => localDocuments.set(id, value)
});

const { recordAccepted, recordStatus, getDelivery, getRecentDeliveries } = require('../utils/whatsappDeliveryStore');

test.beforeEach(() => {
  documents.clear();
  localDocuments.clear();
  firestoreAvailable = false;
});

for (const backend of ['local', 'firestore']) {
  test(`${backend}: status before acceptance is retained and late sent does not regress delivery`, async () => {
    firestoreAvailable = backend === 'firestore';
    await recordStatus({ id: 'wamid-race', recipient_id: '919999999999', status: 'delivered', timestamp: '1791473098' });
    await recordAccepted('wamid-race', { phone: '919999999999', category: 'template_message', title: 'hello' });
    await recordStatus({ id: 'wamid-race', status: 'sent' });
    const result = await getDelivery('wamid-race');
    assert.equal(result.status, 'delivered');
    assert.equal(result.category, 'template_message');
    assert.equal(result.phone, '919999999999');
    assert.equal((await getRecentDeliveries(5))[0].messageId, 'wamid-race');
  });
}

test('failed callback keeps Meta error details', async () => {
  await recordAccepted('wamid-fail', { phone: '919888888888' });
  await recordStatus({ id: 'wamid-fail', status: 'failed', errors: [{ code: 131026, error_data: { details: 'Recipient unavailable' } }] });
  const result = await getDelivery('wamid-fail');
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 131026);
  assert.equal(result.error, 'Recipient unavailable');
});
