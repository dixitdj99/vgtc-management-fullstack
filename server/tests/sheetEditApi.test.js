const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET ||= 'sheet-edit-test-secret';
const firebase = require('../firebase');
firebase.isAvailable = () => false;
const localStore = require('../utils/localStore');
const records = new Map();
localStore.getAll = () => [...records.values()];
localStore.getById = (_collection, id) => records.get(id) || null;
localStore.update = (_collection, id, patch) => {
    const next = { ...records.get(id), ...patch };
    records.set(id, next);
    return next;
};
localStore.insert = (_collection, row) => row;
const sheetRoutes = require('../routes/sheetRoutes');

test('Kosli sheet edit persists in source materials; view permission cannot write', async () => {
    const row = {
        id: 'test-challan', orgId: 'vgtc', challanNo: 'CH-TEST',
        date: '2026-10-01', truckNo: 'HR55AA1234',
        materials: [{ type: 'PPC', totalBags: 100, loadedBags: 20 }],
        status: 'partially_loaded', createdAt: '2026-10-01T00:00:00.000Z',
    };
    records.set(row.id, row);
    let permission = 'edit';
    const app = express();
    app.use(express.json());
    app.use('/api/sheets', (req, _res, next) => {
        req.user = { id: 'sheet-test', name: 'Sheet Test', role: 'staff', orgId: 'vgtc', permissions: { stock_kosli: permission } };
        next();
    }, sheetRoutes);
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
        const base = `http://127.0.0.1:${server.address().port}/api/sheets/challans-kosli`;
        const get = await fetch(base);
        assert.equal(get.status, 200);
        const initial = await get.json();
        assert.equal(initial.rows[0].totalBags, 100);
        const patch = await fetch(`${base}/${row.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ field: 'totalBags', value: 120, revision: initial.rows[0]._revision }),
        });
        assert.equal(patch.status, 200, JSON.stringify(await patch.clone().json()));
        assert.equal((await patch.json()).row.totalBags, 120);
        assert.equal(records.get(row.id).materials[0].totalBags, 120);
        const refreshed = await (await fetch(base)).json();
        assert.equal(refreshed.rows[0].totalBags, 120);
        permission = 'view';
        const forbidden = await fetch(`${base}/${row.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ field: 'partyName', value: 'Denied' }),
        });
        assert.equal(forbidden.status, 403);
        assert.equal(records.get(row.id).partyName, undefined);
    } finally {
        await new Promise(resolve => server.close(resolve));
        records.clear();
    }
});
