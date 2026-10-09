const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const localStore = require('../utils/localStore');
// Keep test data in local throwaway collections even when developer machine has
// Firestore credentials configured.
const firebasePath = require.resolve('../firebase');
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db: null, admin: null, isAvailable: () => false } };
const { normalizeRenewal, addRenewal } = require('../services/vehicleDocumentService');
const vehicleService = require('../services/vehicleService');

const valid = { documentType: 'pollution', paidOn: '2026-10-09', validFrom: '2026-10-09', expiresOn: '2027-04-09', amount: 1500, paymentMethod: 'UPI', reference: 'PUC-10' };
const cleanup = collection => fs.rmSync(path.join(__dirname, '..', 'data', `${collection}.json`), { force: true });

test('document renewal validates type, calendar dates, period and amount', () => {
    assert.equal(normalizeRenewal(valid).amount, 1500);
    for (const bad of [
        { documentType: 'permit' }, { paidOn: '2026-02-30' }, { validFrom: '2026-02-30' },
        { expiresOn: '2026-10-09' }, { amount: -1 }, { amount: 'not money' },
    ]) assert.throws(() => normalizeRenewal({ ...valid, ...bad }));
});

test('renewal updates expiry and history once, scoped to vehicle organisation', async () => {
    const collection = `test_vehicle_renewals_${randomUUID().replaceAll('-', '')}`;
    const orgId = `org-${randomUUID()}`;
    const vehicle = localStore.insert(collection, { orgId, truckNo: 'HR63D9020', docs: JSON.stringify({ pollution: '2026-10-01', fitness: '2026-12-01' }), documentRenewals: [] });
    try {
        await assert.rejects(() => addRenewal('another-org', vehicle.id, valid, collection), /not found/i);
        const saved = await addRenewal(orgId, vehicle.id, valid, collection);
        assert.equal(saved.documentType, 'pollution');
        const updated = localStore.getById(collection, vehicle.id);
        assert.equal(JSON.parse(updated.docs).pollution, valid.expiresOn);
        assert.equal(JSON.parse(updated.docs).fitness, '2026-12-01');
        assert.equal(updated.documentRenewals.length, 1);
        assert.equal(updated.documentRenewals[0].id, saved.id);
    } finally { cleanup(collection); }
});

test('registration keeps one initial payment and rejects history edits', async () => {
    const collection = `test_vehicle_renewals_${randomUUID().replaceAll('-', '')}`;
    const orgId = `org-${randomUUID()}`;
    const vehicle = await vehicleService.createVehicle(orgId, {
        truckNo: `T${randomUUID().slice(0, 7)}`, ownerName: 'Vikas Transport (Self)',
        docs: '{}', initialDocumentRenewals: [valid],
    }, collection);
    try {
        assert.equal(vehicle.documentRenewals.length, 1);
        assert.equal(JSON.parse(vehicle.docs).pollution, valid.expiresOn);
        await vehicleService.updateVehicle(orgId, vehicle.id, { documentRenewals: [valid] }, collection);
        assert.equal(localStore.getById(collection, vehicle.id).documentRenewals.length, 1);
    } finally { cleanup(collection); }
});

test('P&L emits one expense per paid renewal', async () => {
    const { buildPnlRecords } = await import('../../client/src/utils/pnl.js');
    const rows = buildPnlRecords({ vehicles: [{ id: 'v1', truckNo: 'HR63D9020', ownershipType: 'self', documentRenewals: [{ ...valid, id: 'r1' }] }] });
    const expenses = rows.filter(row => row.source === 'vehicle_document');
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0].amount, 1500);
    assert.equal(expenses[0].category, 'Vehicle document renewals');
});
