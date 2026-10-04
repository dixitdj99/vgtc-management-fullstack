const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'terminal-test-secret-only-not-a-real-credential';
process.env.TERMINAL_KEY = 'terminal-test-device-key';
const firebase = require('../firebase');
firebase.isAvailable = () => false;
const localStore = require('../utils/localStore');
const data = new Map();
localStore.getAll = collection => data.get(collection) || [];
localStore.getById = (collection, id) => localStore.getAll(collection).find(p => p.id === id) || null;
localStore.insert = (collection, row) => { data.set(collection, [...localStore.getAll(collection), row]); return row; };
localStore.update = (collection, id, patch) => { data.set(collection, localStore.getAll(collection).map(p => p.id === id ? { ...p, ...patch } : p)); };
const { requireAuth } = require('../middleware/auth');
const engine = require('../services/attendanceDecisionEngine');
const app = express();
app.use(express.json());
app.use('/api/terminal', requireAuth, require('../routes/terminalRoutes'));
app.use('/api/profiles', requireAuth, require('../routes/profileRoutes'));
let server, base;
const token = claims => jwt.sign({ role: 'admin', orgId: 'vgtc', ...claims }, process.env.JWT_SECRET);
async function request(path, { credential = token({}), body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
}
test.before(async () => { server = app.listen(0); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { data.clear(); data.set('profiles', [{ id: 'person1', name: 'Ravi', type: 'Driver' }, { id: 'person2', name: 'Sita', type: 'Custom role', status: 'inactive' }, { id: 'person3', name: 'Fuel account', type: 'Pump' }, { id: 'gone', name: 'Deleted', deleted: true }]); });

test('roster mirrors every portal profile type/status and reflects document deletion', async () => {
    const result = await request('/api/terminal/roster?terminalId=ANDROID-1', { credential: process.env.TERMINAL_KEY });
    assert.equal(result.status, 200);
    assert.deepEqual([...result.body.drivers, ...result.body.staff].map(p => p.id).sort(), ['gone', 'person1', 'person2', 'person3']);
    data.set('profiles', localStore.getAll('profiles').filter(p => p.id !== 'person2'));
    const afterDelete = (await request('/api/terminal/roster')).body;
    assert.equal(afterDelete.staff.some(p => p.id === 'person2'), false);
    assert.ok(result.body.staff.every(p => p.attendanceEnabled));
});
test('bulk pause appears in roster and both biometric attempts produce audit events without punches', async () => {
    assert.equal((await request('/api/terminal/attendance-control', { body: { profileIds: ['person1', 'person2'], attendanceEnabled: false } })).status, 200);
    const roster = (await request('/api/terminal/roster')).body;
    assert.equal(roster.drivers[0].attendanceEnabled, false);
    for (const biometricMethod of ['FACE', 'FINGERPRINT']) {
        const result = await request('/api/terminal/event', { credential: process.env.TERMINAL_KEY, body: { employeeId: 'person1', biometricMethod, terminalId: 'ANDROID-1', fingerprintSlotId: 7 } });
        assert.equal(result.body.status, 'ATTENDANCE_STOPPED');
    }
    assert.equal(localStore.getAll('attendance').length, 0);
    assert.equal((await request('/api/terminal/attempts')).body.events.length, 2);
});
test('resume permits current staff attendance and writes all four records', async () => {
    const result = await request('/api/terminal/event', { body: { employeeId: 'person2', biometricMethod: 'FACE', action: 'CHECK_IN', isTest: true } });
    assert.equal(result.body.status, 'SUCCESS');
    assert.equal(localStore.getAll('attendance_events').length, 1);
    assert.equal(localStore.getAll('attendance').length, 3);
});
test('removed staff cannot be recreated through enrollment or fabricated attendance names', async () => {
    assert.equal((await request('/api/terminal/enroll', { body: { id: 'missing', name: 'Fabricated' } })).status, 404);
    assert.equal((await request('/api/terminal/event', { body: { employeeId: 'missing', personName: 'Ravi' } })).body.status, 'UNKNOWN_EMPLOYEE');
    assert.equal(localStore.getAll('attendance').length, 0);
});
test('fingerprint sensor IDs are scoped to terminal and cannot collide', async () => {
    assert.equal((await request('/api/terminal/enroll', { body: { id: 'person1', terminalId: 'ANDROID-1', fingerprintSlotId: 7 } })).status, 200);
    assert.equal((await request('/api/terminal/enroll', { body: { id: 'person2', terminalId: 'ANDROID-1', fingerprintSlotId: 7 } })).status, 409);
    assert.equal((await request('/api/terminal/enroll', { body: { id: 'person2', terminalId: 'ANDROID-2', fingerprintSlotId: 7 } })).status, 200);
    assert.equal((await request('/api/terminal/event', { body: { employeeId: 'person1', terminalId: 'ANDROID-2', biometricMethod: 'FINGERPRINT', fingerprintSlotId: 7, isTest: true } })).body.status, 'FINGERPRINT_MISMATCH');
});
test('terminal credentials cannot control attendance or create/delete staff; sandbox and unauthorized users denied', async () => {
    for (const path of ['/api/profiles', '/api/terminal/attendance-control', '/api/terminal/enroll/delete']) {
        assert.equal((await request(path, { credential: process.env.TERMINAL_KEY, body: { profileIds: ['person1'], attendanceEnabled: false } })).status, 403);
    }
    assert.equal((await request('/api/profiles/person1', { credential: process.env.TERMINAL_KEY, method: 'DELETE' })).status, 403);
    for (const claims of [{ isSandbox: true }, { orgId: 'foreign' }, { role: 'user', permissions: {} }]) {
        assert.equal((await request('/api/terminal/roster', { credential: token(claims) })).status, 403);
    }
    assert.equal((await request('/api/terminal/roster', { credential: 'VGTC-TERMINAL-TOKEN-KEY' })).status, 401);
});
test('bulk update rejects deleted IDs without partially updating others', async () => {
    assert.equal((await request('/api/terminal/attendance-control', { body: { profileIds: ['person1', 'missing'], attendanceEnabled: false } })).status, 404);
    assert.equal(localStore.getById('profiles', 'person1').attendanceEnabled, undefined);
});

test('locally blocked scan remains audit-only after server attendance resumes', async () => {
    const result = await request('/api/terminal/event', { body: { employeeId: 'person1', action: 'BLOCKED_ATTEMPT', biometricMethod: 'FACE' } });
    assert.equal(result.body.status, 'ATTENDANCE_STOPPED');
    assert.equal(localStore.getAll('attendance').length, 0);
    assert.equal(localStore.getAll('attendance_events')[0].reason, 'TERMINAL_PAUSED_STATE');
});
