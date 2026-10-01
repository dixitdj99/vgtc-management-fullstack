const test = require('node:test');
const assert = require('node:assert/strict');

// In-memory Firestore stand-in: no configured project is contacted.
const rows = new Map();
let nextId = 1;
let transactions = 0;
let queue = Promise.resolve();
const ref = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
const db = {
    collection(name) {
        return {
            doc(id) { return ref(name, id || `new-${nextId++}`); },
            where(field, operator, value) { return { collection: name, field, operator, value }; }
        };
    },
    runTransaction(callback) {
        const current = queue.then(async () => {
            transactions++;
            const writes = [];
            const tx = {
                async get(target) {
                    if (target.key) {
                        const value = rows.get(target.key);
                        return { exists: !!value, data: () => value };
                    }
                    const docs = [...rows.entries()]
                        .filter(([key, value]) => key.startsWith(`${target.collection}/`) && value[target.field] === target.value)
                        .map(([, value]) => ({ data: () => value }));
                    return { docs };
                },
                set(target, value) { writes.push([target.key, value]); }
            };
            const result = await callback(tx);
            for (const [key, value] of writes) rows.set(key, value);
            return result;
        });
        queue = current.catch(() => {});
        return current;
    }
};
const firebasePath = require.resolve('../firebase');
require.cache[firebasePath] = {
    id: firebasePath, filename: firebasePath, loaded: true,
    exports: {
        db,
        admin: { firestore: { FieldValue: { serverTimestamp: () => 'test-timestamp' } } },
        isAvailable: () => true
    }
};
const stockService = require('../utils/stockService');

test('concurrent godown challans get unique five-digit numbers in one transaction', async () => {
    const col = 'dev_kosli_challans';
    rows.set(`${col}/legacy`, { orgId: 'vgtc', challanNo: 'CH-0007' });
    const data = { challanNo: '00008', truckNo: 'HR55EF9012', material: 'PPC', quantity: 10 };
    const created = await Promise.all(Array.from({ length: 20 }, () =>
        stockService.createChallan('vgtc', data, col, ['PPC'])));
    const numbers = created.map(row => row.challanNo);
    assert.deepEqual(numbers, Array.from({ length: 20 }, (_, index) => String(index + 8).padStart(5, '0')));
    assert.equal(new Set(numbers).size, 20);
    assert.equal(rows.get('challan_counters/dev_kosli_challans_vgtc').lastNumber, 27);
    assert.equal(transactions, 20);
    for (const createdRow of created) {
        assert.equal(rows.get(`${col}/${createdRow.id}`).challanNo, createdRow.challanNo);
    }
    const anotherGodown = await stockService.createChallan('vgtc', data, 'dev_jhajjar_challans', ['PPC']);
    assert.equal(anotherGodown.challanNo, '00001');
});
