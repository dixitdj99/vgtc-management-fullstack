const test = require('node:test');
const assert = require('node:assert/strict');
// Never let this unit test reach the configured Firestore project.
const firebasePath = require.resolve('../firebase');
require.cache[firebasePath] = {
    id: firebasePath, filename: firebasePath, loaded: true,
    exports: { db: null, admin: null, isAvailable: () => false }
};
const stockService = require('../utils/stockService');
const localStore = require('../utils/localStore');

test('five-digit challan numbering advances past legacy and current codes', () => {
    assert.equal(stockService.nextFiveDigitChallanNo([]), '00001');
    assert.equal(stockService.nextFiveDigitChallanNo([
        { challanNo: 'CH-0004' }, { challanNo: '00007' }, { challanNo: 'CUSTOM' }
    ]), '00008');
    assert.equal(stockService.nextFiveDigitChallanNo([], 9), '00010');
    assert.throws(() => stockService.nextFiveDigitChallanNo([{ challanNo: '99999' }]), /exhausted/);
});

test('dump godowns auto-allocate independent challan numbers; Jharli retains prior format', async () => {
    const originalGetAll = localStore.getAll;
    const originalInsert = localStore.insert;
    const collections = new Map();
    localStore.getAll = name => collections.get(name) || [];
    localStore.insert = (name, data) => {
        const row = { id: `test-${(collections.get(name) || []).length + 1}`, ...data };
        collections.set(name, [...(collections.get(name) || []), row]);
        return row;
    };
    try {
        const payload = { challanNo: '99990', truckNo: 'HR55EF9012', material: 'PPC', quantity: 10 };
        for (const col of ['kosli_challans', 'jhajjar_challans', 'bahadurgarh_challans']) {
            collections.set(col, [{ orgId: 'vgtc', challanNo: 'CH-0004' }]);
            const first = await stockService.createChallan('vgtc', payload, col, ['PPC']);
            const second = await stockService.createChallan('vgtc', payload, col, ['PPC']);
            assert.equal(first.challanNo, '00005', col);
            assert.equal(second.challanNo, '00006', col);
            assert.equal(first.lrNo, '', col);
        }
        const jharli = await stockService.createChallan('vgtc', { ...payload, challanNo: '' }, 'jkl_challans', ['PPC']);
        assert.equal(jharli.challanNo, 'CH-0001');
    } finally {
        localStore.getAll = originalGetAll;
        localStore.insert = originalInsert;
    }
});
