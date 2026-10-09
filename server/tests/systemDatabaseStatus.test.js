const test = require('node:test');
const assert = require('node:assert/strict');

function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const db = {
  listCollections: async () => [{ id: 'dev_vouchers' }, { id: 'dev_broken' }, { id: 'prod_users' }],
  collection: name => ({
    count: () => ({ get: async () => {
      if (name === 'dev_broken') throw new Error('Permission denied');
      return { data: () => ({ count: 7 }) };
    } }),
    limit: count => ({ get: async () => ({ docs: count ? [{ data: () => ({ voucherNo: 12, total: 100, details: { paid: true } }) }] : [] }) })
  })
};
stub('../firebase', { db, isAvailable: () => true });
stub('../utils/envConfig', { ENV: 'local', getEnvPrefix: () => 'dev_' });
stub('../utils/localStore', { getAll: () => [] });

const { getDatabaseTables, getDatabaseTableDetail } = require('../utils/systemDatabaseStatus');

test('lists actual active collections and reports count failures honestly', async () => {
  const result = await getDatabaseTables();
  assert.equal(result.totalTables, 2);
  assert.equal(result.totalDocs, null);
  assert.equal(result.failedTables, 1);
  assert.equal(result.tables.find(row => row.name === 'vouchers').count, 7);
  const broken = result.tables.find(row => row.name === 'broken');
  assert.equal(broken.status, 'error');
  assert.equal(broken.count, null);
  assert.match(broken.error, /Permission denied/);
});

test('detail reports field names and types without record values', async () => {
  const detail = await getDatabaseTableDetail('dev_vouchers');
  assert.deepEqual(detail.fields.find(field => field.name === 'details.paid').types, ['boolean']);
  assert.equal(detail.sampledDocuments, 1);
  assert.equal(await getDatabaseTableDetail('prod_users'), null);
  assert.equal(await getDatabaseTableDetail('../dev_vouchers'), null);
  assert.equal(JSON.stringify(detail).includes('100'), false);
});
