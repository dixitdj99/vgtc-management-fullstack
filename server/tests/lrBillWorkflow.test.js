const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('../firebase');
firebase.isAvailable = () => false;
const localStore = require('../utils/localStore');

const collections = new Map();
const counters = new Map();
const rows = name => collections.get(name) || [];
localStore.getAll = name => rows(name);
localStore.getById = (name, id) => rows(name).find(row => row.id === id) || null;
let idCounter = 1;
localStore.insert = (name, data) => {
    const row = { id: data.id || `row-${idCounter++}`, ...data, createdAt: new Date().toISOString() };
    collections.set(name, [...rows(name), row]);
    return row;
};
localStore.update = (name, id, patch) => {
    const updated = rows(name).map(row => row.id === id ? { ...row, ...patch } : row);
    collections.set(name, updated);
    return updated.find(row => row.id === id);
};
localStore.delete = (name, id) => collections.set(name, rows(name).filter(row => row.id !== id));
localStore.getCounter = (name, base = 1000) => {
    const current = counters.get(name);
    let next;
    if (current === undefined || (base > 0 && (current < base || current > 9999))) {
        next = base > 0 ? base + 1 : 1;
    } else {
        next = current + 1;
    }
    counters.set(name, next);
    return next;
};

const lrService = require('../services/lrService');

test('Kosli receipt creates one linked bill with matching ID and totals', async () => {
    const lrCollection = 'dev_test_kosli_loading_receipts';
    const result = await lrService.createLoadingReceipt('test-org', {
        billNo: 'B-42', partyCode: 'P-5', date: '2026-10-01',
        materials: [
            { type: 'PPC', loadingType: 'From Godown', bags: 20, weight: 1, destination: 'KOSLI CITY' },
            { type: 'OPC', loadingType: 'From Godown', bags: 10, weight: 0.5, destination: 'REWARI' },
        ],
    }, lrCollection, 'dev_test_kosli_metadata');
    const receipts = rows(lrCollection);
    const bills = rows('dev_test_vouchers');
    assert.equal(receipts.length, 2);
    assert.equal(bills.length, 1);
    assert.deepEqual(result.lrNos, [1001, 1002]);
    assert.deepEqual(receipts.map(row => row.lrNo), [1001, 1002]);
    assert.equal(receipts[0].entryId, receipts[1].entryId);
    assert.equal(receipts[0].entryId, 100001);
    assert.deepEqual(receipts.map(row => row.destination), ['KOSLI CITY', 'REWARI']);
    assert.equal(result.billId, receipts[0].id);
    assert.equal(bills[0].id, receipts[0].id);
    assert.equal(bills[0].entryId, receipts[0].entryId);
    assert.equal(bills[0].lrNo, '1001, 1002');
    assert.deepEqual(bills[0].deliveries.map(delivery => delivery.lrNo), ['1001', '1002']);
    assert.deepEqual(bills[0].deliveries.map(delivery => delivery.destination), ['KOSLI CITY', 'REWARI']);
    assert.equal(bills[0].commission, 45);
    assert.equal(bills[0].rate, '');
});

test('loading receipt without challan creates bill with blank rate and automatic commission', async () => {
    const lrCollection = 'dev_test_bahadurgarh_loading_receipts';
    const result = await lrService.createLoadingReceipt('test-org', {
        billNo: 'B-44', partyCode: 'P-6', date: '2026-10-01',
        materials: [{ type: 'PPC', loadingType: 'From Godown', bags: 10, weight: 0.5, destination: 'BAHADURGARH' }],
    }, lrCollection, 'dev_test_bahadurgarh_metadata');
    const receipts = rows(lrCollection);
    const bills = rows('dev_test_vouchers');
    const bill = bills.find(b => b.id === result.billId);
    assert.ok(bill);
    assert.equal(bill.billNo, 'B-44');
    assert.equal(bill.rate, '');
    assert.equal(bill.commission, 15);
    assert.equal(bill.hasCommission, true);
});

test('linked receipt cannot be deleted before its bill', async () => {
    await assert.rejects(() => lrService.deleteLoadingReceipt('row-1', 'dev_test_kosli_loading_receipts'), /Delete linked bill/);
    await assert.rejects(() => lrService.deleteLoadingReceipt('row-2', 'dev_test_kosli_loading_receipts'), /Delete linked bill/);
    assert.equal(rows('dev_test_kosli_loading_receipts').length, 2);
});

test('manual LR number collision is rejected within same godown and series are separate', async () => {
    const payload = {
        billNo: 'B-43', partyCode: 'P-5', date: '2026-10-01', lrNo: 1002,
        materials: [{ type: 'PPC', loadingType: 'From Godown', bags: 1, weight: 0.05 }],
    };
    await assert.rejects(() => lrService.createLoadingReceipt('test-org', payload, 'dev_test_kosli_loading_receipts', 'dev_test_kosli_metadata'), /already exists/);
    const jhajjar = await lrService.createLoadingReceipt('test-org', payload, 'dev_test_jhajjar_loading_receipts', 'dev_test_jhajjar_metadata');
    assert.equal(jhajjar.lrNo, 1002);
    assert.equal(rows('dev_test_jhajjar_loading_receipts')[0].lrNo, 1002);
    await assert.rejects(() => lrService.createLoadingReceipt('test-org', {
        lrNo: 10000, billNo: 'B-44', partyCode: 'P-5',
        materials: [{ type: 'PPC', loadingType: 'From Godown', bags: 1, weight: 0.05 }],
    }, 'dev_test_jhajjar_loading_receipts', 'dev_test_jhajjar_metadata'), /4-digit/);
});

test('three godowns require bill number and party code; Jharli does not', async () => {
    const materials = [{ type: 'PPC', loadingType: 'From Godown', bags: 1, weight: 0.05 }];
    for (const godown of ['kosli', 'jhajjar', 'bahadurgarh']) {
        await assert.rejects(() => lrService.createLoadingReceipt('test-org', { materials }, `dev_test_${godown}_loading_receipts`), /Bill number is required/);
        await assert.rejects(() => lrService.createLoadingReceipt('test-org', { materials, billNo: 'B-1' }, `dev_test_${godown}_loading_receipts`), /Party code is required/);
    }
});

test('missing bill can be recovered once for full LR group with correct scope', async () => {
    const col = 'dev_test_kosli_loading_receipts';
    const first = localStore.insert(col, { orgId: 'recovery-org', entryId: 100009, lrNo: 1501, material: 'PPC', loadingType: 'From Godown', totalBags: 10, weight: 0.5, partyName: 'ABC', destination: 'KOSLI' });
    localStore.insert(col, { orgId: 'recovery-org', entryId: 100009, lrNo: 1502, material: 'OPC', loadingType: 'From Godown', totalBags: 20, weight: 1, partyName: 'ABC', destination: 'REWARI' });
    await assert.rejects(() => lrService.createBillForLoadingReceipt('other-org', first.id, { billNo: 'B-99', partyCode: 'P-99' }, col), /not found/);
    await assert.rejects(() => lrService.createBillForLoadingReceipt('recovery-org', first.id, {}, col), /Bill number is required/);
    const result = await lrService.createBillForLoadingReceipt('recovery-org', first.id, { billNo: 'B-99', partyCode: 'P-99' }, col);
    assert.equal(result.created, true);
    assert.deepEqual(result.lrNos, [1501, 1502]);
    const bill = rows('dev_test_vouchers').find(row => row.id === result.billId);
    assert.equal(bill.entryId, 100009);
    assert.equal(bill.billNo, 'B-99');
    assert.deepEqual(bill.deliveries.map(row => row.destination), ['KOSLI', 'REWARI']);
    assert.equal(bill.commission, 45);
    assert.equal(bill.rate, '');
    const retry = await lrService.createBillForLoadingReceipt('recovery-org', first.id, { billNo: 'B-99', partyCode: 'P-99' }, col);
    assert.equal(retry.created, false);
    assert.equal(retry.billId, result.billId);
    assert.equal(rows('dev_test_vouchers').filter(row => row.orgId === 'recovery-org').length, 1);
    await assert.rejects(() => lrService.createBillForLoadingReceipt('recovery-org', first.id, { billNo: 'B-99', partyCode: 'P-99' }, 'dev_test_jhajjar_loading_receipts'), /not found/);
    const another = localStore.insert(col, { orgId: 'recovery-org', entryId: 100010, lrNo: 1503, material: 'PPC', totalBags: 1, weight: 0.05 });
    await assert.rejects(() => lrService.createBillForLoadingReceipt('recovery-org', another.id, { billNo: 'B-99', partyCode: 'P-99' }, col), /already exists/);
});

test('Jharli receipt flow does not require or create a bill', async () => {
    const before = rows('dev_test_vouchers').length;
    const result = await lrService.createLoadingReceipt('test-org', {
        date: '2026-10-01',
        materials: [{ type: 'PPC', loadingType: 'From Godown', bags: 1, weight: 0.05 }],
    }, 'dev_test_jkl_loading_receipts', 'dev_test_jkl_metadata');
    assert.equal(result.billId, undefined);
    assert.equal(rows('dev_test_vouchers').length, before);
});
