const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('../firebase');

// Exercise the same transactions and batch writes as production. Firestore
// rejects undefined values; the local JSON store does not.
const collections = new Map();
let generatedId = 0;
const rows = name => collections.get(name) || new Map();
const assertFirestoreData = value => {
    if (value === undefined) throw new Error('Firestore cannot store undefined');
    if (Array.isArray(value)) value.forEach(assertFirestoreData);
    else if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        Object.values(value).forEach(assertFirestoreData);
    }
};
const makeSnapshot = (name, entries) => ({
    docs: entries.map(([id, data]) => ({ id, data: () => data })),
    empty: entries.length === 0,
});
const db = firebase.db;
db.collection = name => ({
    doc(id) {
        const key = id || `lr-doc-${++generatedId}`;
        return { kind: 'doc', name, id: key };
    },
    where(field, _operator, value) {
        const query = { kind: 'query', name, field, value };
        query.get = async () => makeSnapshot(name, [...rows(name)].filter(([, row]) => row[field] === value));
        return query;
    },
});
const snapshot = target => {
    if (target.kind === 'query') return makeSnapshot(target.name, [...rows(target.name)].filter(([, row]) => row[target.field] === target.value));
    const data = rows(target.name).get(target.id);
    return { id: target.id, exists: !!data, data: () => data };
};
const write = (kind, target, data, options) => {
    assertFirestoreData(data);
    const map = rows(target.name);
    const before = map.get(target.id) || {};
    map.set(target.id, kind === 'update' || options?.merge ? { ...before, ...data } : data);
    collections.set(target.name, map);
};
db.runTransaction = async callback => {
    const changes = [];
    const value = await callback({
        get: async target => snapshot(target),
        set: (target, data, options) => changes.push(['set', target, data, options]),
        create: (target, data) => changes.push(['create', target, data]),
        update: (target, data) => changes.push(['update', target, data]),
    });
    changes.forEach(change => write(...change));
    return value;
};
db.batch = () => {
    const changes = [];
    return {
        set: (target, data) => changes.push(['set', target, data]),
        update: (target, data) => changes.push(['update', target, data]),
        commit: async () => {
            changes.forEach(([, , data]) => assertFirestoreData(data));
            changes.forEach(change => write(...change));
        },
    };
};
firebase.isAvailable = () => true;
const lrService = require('../services/lrService');

test('production Firestore path atomically saves receipt rows and linked bill without optional vehicle fields', async () => {
    const result = await lrService.createLoadingReceipt('firestore-org', {
        date: '2026-10-02', billNo: 'F-1', partyCode: 'P-1',
        materials: [
            { type: 'PPC', loadingType: 'From Godown', bags: 20, weight: 1, destination: 'KOSLI', partyCode: 'P-1' },
            { type: 'OPC', loadingType: 'From Godown', bags: 10, weight: 0.5, destination: 'REWARI', partyCode: 'P-2' },
        ],
    }, 'kosli_loading_receipts', 'kosli_metadata');
    const receiptRows = [...rows('kosli_loading_receipts').values()];
    const bill = rows('vouchers').get(result.billId);
    assert.equal(receiptRows.length, 2);
    assert.ok(bill);
    assert.deepEqual(result.lrNos, [1001, 1002]);
    assert.equal(result.entryId, 100001);
    assert.ok(receiptRows.every(row => row.entryId === result.entryId));
    assert.equal(bill.entryId, result.entryId);
    assert.deepEqual(bill.deliveries.map(row => row.partyCode), ['P-1', 'P-2']);
    assert.equal(bill.truckNo, '');
    assert.equal(bill.commission, 45);
});

test('Firestore rejects duplicate manual LR number before creating another bill', async () => {
    await assert.rejects(() => lrService.createLoadingReceipt('firestore-org', {
        lrNo: 1002, billNo: 'F-2', partyCode: 'P-1',
        materials: [{ type: 'PPC', loadingType: 'From Godown', bags: 1, weight: 0.05 }],
    }, 'kosli_loading_receipts', 'kosli_metadata'), /already exists/);
    assert.equal(rows('vouchers').size, 1);
    assert.equal(rows('kosli_loading_receipts').size, 2);
});

test('Firestore bill recovery is idempotent for receipt group and rejects cross-org', async () => {
    const existing = [...rows('kosli_loading_receipts').entries()];
    rows('vouchers').delete(existing[0][0]);
    const result = await lrService.createBillForLoadingReceipt('firestore-org', existing[0][0], { billNo: 'F-1', partyCode: 'P-1' }, 'kosli_loading_receipts');
    assert.equal(result.created, true);
    assert.deepEqual(result.lrNos, [1001, 1002]);
    assert.equal(rows('vouchers').get(result.billId).entryId, 100001);
    const retry = await lrService.createBillForLoadingReceipt('firestore-org', existing[1][0], {}, 'kosli_loading_receipts');
    assert.equal(retry.created, false);
    assert.equal(rows('vouchers').size, 1);
    await assert.rejects(() => lrService.createBillForLoadingReceipt('other-org', existing[0][0], {}, 'kosli_loading_receipts'), /not found/);
});
