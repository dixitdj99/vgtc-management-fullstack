const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'driver-master-route-test-secret';

const records = new Map([
    ['driver-1', { id: 'driver-1', type: 'Driver', name: 'Original Driver', fixedSalary: 18000, mobileNumbers: ['9876543210'] }],
    ['staff-1', { id: 'staff-1', type: 'Office Staff', name: 'Office Person' }]
]);

function mock(modulePath, exports) {
    const id = require.resolve(modulePath);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}

mock('../firebase', { isAvailable: () => false, db: null });
mock('../utils/localStore', {
    getAll: () => [...records.values()],
    getById: (_collection, id) => records.get(id) || null,
    update: (_collection, id, patch) => {
        const next = { ...records.get(id), ...patch };
        records.set(id, next);
        return next;
    }
});
mock('../services/attendanceRealtime', { publishAttendanceChange: () => {} });
mock('../utils/terminalKeyStore', { isTerminalTokenAsync: async () => false });

const { requireAuth } = require('../middleware/auth');
const profileRoutes = require('../routes/profileRoutes');

test('Driver Master enforces edit permission, updates shared profile, and rejects invalid expiry', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/profiles', requireAuth, profileRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/profiles`;
    const token = (permissions, role = 'staff') => jwt.sign({ id: 'tester', role, orgId: 'vgtc', permissions }, process.env.JWT_SECRET);
    const request = (path, method, permissions, body, role) => fetch(`${base}${path}`, {
        method, headers: { Authorization: `Bearer ${token(permissions, role)}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    try {
        const denied = await request('/driver-1/driver-master', 'PATCH', { vehicle: 'view' }, { licenseNumber: 'DL-123' });
        assert.equal(denied.status, 403);

        const updated = await request('/driver-1/driver-master', 'PATCH', { vehicle: 'edit' }, {
            licenseNumber: 'DL-123', licenseExpiry: '2028-05-14', fixedSalary: 21000, mobileNumbers: ['9000000000']
        });
        assert.equal(updated.status, 200);
        const fetched = await request('/', 'GET', { vehicle: 'view' });
        assert.equal(fetched.status, 200);
        const driver = (await fetched.json()).find(p => p.id === 'driver-1');
        assert.equal(driver.licenseNumber, 'DL-123');
        assert.equal(driver.licenseExpiry, '2028-05-14');
        assert.equal(driver.fixedSalary, 21000);
        assert.deepEqual(driver.mobileNumbers, ['9000000000']);

        const badDate = await request('/driver-1/driver-master', 'PATCH', { vehicle: 'edit' }, { licenseExpiry: '2028-02-30' });
        assert.equal(badDate.status, 400);
        assert.equal(records.get('driver-1').licenseExpiry, '2028-05-14');

        const superadmin = await request('/driver-1/driver-master', 'PATCH', {}, { licenseNumber: 'DL-124' }, 'superadmin');
        assert.equal(superadmin.status, 200);
        assert.equal(records.get('driver-1').licenseNumber, 'DL-124');

        const wrongProfile = await request('/staff-1/driver-master', 'PATCH', { vehicle: 'edit' }, { licenseNumber: 'DL-999' });
        assert.equal(wrongProfile.status, 404);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
