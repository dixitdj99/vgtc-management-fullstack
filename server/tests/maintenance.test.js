const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const firebasePath = require.resolve('../firebase');
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db: null, admin: null, isAvailable: () => false } };
const localStore = require('../utils/localStore');
const service = require('../services/maintenanceService');
const { getEnvCol } = require('../utils/collectionUtils');

const dateOffset = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test('service visit computes costs, due alert, deduplicated notification and enforces organization scope', async () => {
  const orgId = `maintenance-test-${crypto.randomUUID()}`;
  const truckNo = 'TESTMAINT001';
  let created;
  try {
    created = await service.createService(orgId, {
      truckNo, date: dateOffset(-90), odometer: 10000, serviceType: 'Scheduled service',
      parts: [{ partId: 'engine_oil', quantity: 2, unitCost: 1250 }, { partName: 'Misc part', quantity: 1, unitCost: 300 }],
      labourCost: 500, otherCost: 100, nextServiceDate: dateOffset(7), nextServiceKm: 16000,
    });
    assert.equal(created.partsCost, 2800);
    assert.equal(created.totalCost, 3400);
    assert.equal((await service.getServices(orgId, truckNo)).length, 1);
    assert.equal((await service.getServices('other-organization', truckNo)).length, 0);
    await assert.rejects(service.updateService('other-organization', created.id, { notes: 'hack' }), { status: 404 });
    await assert.rejects(service.deleteService('other-organization', created.id), { status: 404 });
    const alerts = await service.getMaintenanceAlerts(orgId);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].status, 'DUE_SOON');
    assert.equal(alerts[0].nextServiceKm, 16000);
    const first = await service.notifyServiceDue(orgId);
    const second = await service.notifyServiceDue(orgId);
    assert.equal(first.notificationsCreated, 1);
    assert.equal(second.notificationsCreated, 0);
    const notice = localStore.getAll(getEnvCol('notifications')).find(item => item.orgId === orgId);
    assert.ok(notice);
  } finally {
    if (created) await service.deleteService(orgId, created.id);
    for (const notification of localStore.getAll(getEnvCol('notifications')).filter(item => item.orgId === orgId)) localStore.delete(getEnvCol('notifications'), notification.id);
  }
});

test('service visit rejects invalid costs and dates', async () => {
  const base = { truckNo: 'TESTMAINT002', date: dateOffset(-1), parts: [] };
  await assert.rejects(service.createService('test', { ...base, labourCost: -1 }), /non-negative/);
  await assert.rejects(service.createService('test', { ...base, nextServiceDate: dateOffset(-2) }), /after date/);
});

test('part record keeps due fields and rejects cross-organization edits', async () => {
  const orgId = `maintenance-test-${crypto.randomUUID()}`;
  let created;
  try {
    created = await service.createRecord(orgId, { truckNo: 'TESTMAINT003', partId: 'engine_oil', date: dateOffset(-10), nextServiceDate: dateOffset(5), nextServiceKm: 20000, cost: 900 });
    assert.equal((await service.getMaintenanceSummary(orgId, 'TESTMAINT003')).engine_oil.nextServiceKm, 20000);
    await assert.rejects(service.updateRecord('different-org', created.id, { cost: 1 }), { status: 404 });
    await assert.rejects(service.deleteRecord('different-org', created.id), { status: 404 });
    assert.equal((await service.getMaintenanceAlerts(orgId))[0].status, 'DUE_SOON');
  } finally {
    if (created) await service.deleteRecord(orgId, created.id);
  }
});

test('separate service types on one truck keep independent due alerts', async () => {
  const orgId = `maintenance-test-${crypto.randomUUID()}`;
  const created = [];
  try {
    for (const serviceType of ['Engine service', 'Brake inspection']) {
      created.push(await service.createService(orgId, {
        truckNo: 'TESTMAINT004', date: dateOffset(-30), serviceType,
        nextServiceDate: dateOffset(3), parts: [], labourCost: 100,
      }));
    }
    const alerts = await service.getMaintenanceAlerts(orgId);
    assert.deepEqual(alerts.map(alert => alert.partName).sort(), ['Brake inspection', 'Engine service']);
  } finally {
    for (const record of created) await service.deleteService(orgId, record.id);
  }
});

test('latest recorded odometer triggers km-based service alert', async () => {
  const orgId = `maintenance-test-${crypto.randomUUID()}`;
  const created = [];
  try {
    created.push(await service.createService(orgId, {
      truckNo: 'TESTMAINT005', date: dateOffset(-20), odometer: 10000,
      serviceType: 'Engine service', nextServiceKm: 16000, parts: [],
    }));
    created.push(await service.createService(orgId, {
      truckNo: 'TESTMAINT005', date: dateOffset(-1), odometer: 15500,
      serviceType: 'Inspection', parts: [],
    }));
    const alerts = await service.getMaintenanceAlerts(orgId);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].status, 'DUE_SOON');
    assert.equal(alerts[0].currentKm, 15500);
    assert.equal(alerts[0].kmRemaining, 500);
  } finally {
    for (const record of created) await service.deleteService(orgId, record.id);
  }
});
