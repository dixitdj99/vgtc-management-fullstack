const test = require('node:test');
const assert = require('node:assert/strict');

const firebase = require('../firebase');
firebase.isAvailable = () => false;
const localStore = require('../utils/localStore');

const collections = new Map();
const counters = new Map();
let nextId = 1;
const rows = collection => collections.get(collection) || [];
localStore.getAll = rows;
localStore.getById = (collection, id) => rows(collection).find(row => row.id === id) || null;
localStore.insert = (collection, data) => {
    const row = { id: data.id || `sync-${nextId++}`, ...data };
    collections.set(collection, [...rows(collection), row]);
    return row;
};
localStore.update = (collection, id, patch) => {
    const updated = rows(collection).map(row => row.id === id ? { ...row, ...patch } : row);
    collections.set(collection, updated);
    return updated.find(row => row.id === id);
};
localStore.getCounter = (name, base = 1000) => {
    const current = counters.get(name);
    const next = current === undefined || (base > 0 && (current < base || current > 9999))
        ? (base > 0 ? base + 1 : 1) : current + 1;
    counters.set(name, next);
    return next;
};

const { createLoadingReceipt } = require('../services/lrService');
const partyService = require('../services/partyService');
const orgId = 'lr-party-sync-org';
const getParties = () => partyService.getAllParties(orgId, { user: { isSandbox: true } });
const material = (partyName, partyCode) => ({
    type: 'PPC', loadingType: 'From Godown', bags: 1, weight: 0.05,
    ...(partyName ? { partyName } : {}), ...(partyCode ? { partyCode } : {})
});
const create = (site, partyName, partyCode, extras = {}) => createLoadingReceipt(orgId, {
    partyName, partyCode, billNo: `B-${nextId}`, date: '2026-10-02',
    materials: [material()], ...extras
}, `dev_test_${site}_loading_receipts`, `dev_test_${site}_metadata`);

test('LR creates Party Master entry with code and exact site tag, then merges other site', async () => {
    const first = await create('kosli', 'Shree Traders', 'pc-100');
    const parties = await getParties();
    assert.equal(parties.length, 1);
    assert.equal(parties[0].name, 'SHREE TRADERS');
    assert.equal(parties[0].partyCode, 'PC-100');
    assert.deepEqual(parties[0].locations, ['kosli']);
    assert.deepEqual(parties[0].brands, ['jksuper']);
    assert.equal(rows('dev_test_parties').length, 1);
    assert.equal(rows('dev_parties').length, 0);
    assert.equal(rows('dev_test_kosli_loading_receipts')[0].partyId, parties[0].id);
    assert.ok(first.billId);

    await create('jhajjar', ' shree  traders ', 'PC-100');
    const merged = (await getParties())[0];
    assert.equal((await getParties()).length, 1);
    assert.deepEqual(merged.locations, ['kosli', 'jhajjar']);
    assert.deepEqual(merged.brands, ['jksuper']);
});

test('existing master code survives conflicting or blank LR code; location still added', async () => {
    await create('bahadurgarh', 'SHREE TRADERS', 'OTHER-CODE');
    await create('kosli', 'SHREE TRADERS', 'PC-100');
    const [party] = await getParties();
    assert.equal(party.partyCode, 'PC-100');
    assert.deepEqual(party.locations, ['kosli', 'jhajjar', 'bahadurgarh']);
});

test('each material party is auto-created and tagged with its own code', async () => {
    await create('kosli', 'Global Dealer', 'G-1', {
        materials: [material('Global Dealer'), material('Material Dealer', 'M-2')]
    });
    const parties = await getParties();
    const global = parties.find(p => p.name === 'GLOBAL DEALER');
    const materialParty = parties.find(p => p.name === 'MATERIAL DEALER');
    assert.equal(global.partyCode, 'G-1');
    assert.equal(materialParty.partyCode, 'M-2');
    assert.deepEqual(materialParty.locations, ['kosli']);
    assert.deepEqual(rows('dev_test_kosli_loading_receipts').slice(-2).map(r => r.partyId), [global.id, materialParty.id]);
});

test('different material party without own code does not inherit global party code', async () => {
    const result = await create('kosli', 'Code Owner', 'CO-1', {
        materials: [material('Code Owner'), material('Other Dealer')]
    });
    const receipts = rows('dev_test_kosli_loading_receipts').filter(row => result.ids.includes(row.id));
    const bill = rows('dev_test_vouchers').find(row => row.id === result.billId);
    assert.deepEqual(receipts.map(row => row.partyCode), ['CO-1', '']);
    assert.deepEqual(bill.deliveries.map(row => row.partyCode), ['CO-1', '']);
    const other = (await getParties()).find(row => row.name === 'OTHER DEALER');
    assert.equal(other.partyCode, '');
    assert.deepEqual(other.locations, ['kosli']);
});

test('failed duplicate bill does not auto-create party', async () => {
    const existingBill = rows('dev_test_vouchers').find(row => row.type === 'Kosli_Bill');
    await assert.rejects(() => create('kosli', 'Never Created Dealer', 'N-1', { billNo: existingBill.billNo }), /already exists/);
    assert.equal((await getParties()).some(p => p.name === 'NEVER CREATED DEALER'), false);
});

test('Jharli is tagged as Jharli, while generic LR remains untagged', async () => {
    await createLoadingReceipt(orgId, { partyName: 'Jharli Dealer', materials: [material()] }, 'dev_test_jkl_loading_receipts', 'dev_test_jkl_metadata');
    await createLoadingReceipt(orgId, { partyName: 'Generic Dealer', materials: [material()] }, 'dev_test_loading_receipts', 'dev_test_metadata');
    const parties = await getParties();
    assert.deepEqual(parties.find(p => p.name === 'JHARLI DEALER').locations, ['jharli']);
    assert.deepEqual(parties.find(p => p.name === 'GENERIC DEALER').locations, []);
});
