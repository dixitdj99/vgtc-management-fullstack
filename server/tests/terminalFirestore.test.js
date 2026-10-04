const test = require('node:test');
const assert = require('node:assert/strict');
const collections = new Map();
let listener, subscriptions = 0, reads = 0, transactionCommits = [], pauseDuringTransaction = false;
const rows = name => collections.get(name) || new Map();
const snapshot = (id, value) => ({ id, exists: value !== undefined, data: () => value });
const db = { collection(name) { return {
    name,
    doc(id) { return { name, id, async get() { reads++; return snapshot(id, rows(name).get(id)); }, async set(value) { rows(name).set(id, value); } }; },
    where(field, operator, value) { return { name, field, value }; },
    onSnapshot(callback) { subscriptions++; listener = () => callback({ docs: [...rows(name)].map(([id, row]) => snapshot(id, row)) }); queueMicrotask(listener); return () => {}; },
}; }, async runTransaction(callback) {
    const writes = [];
    const result = await callback({ async get(ref) {
        reads++;
        if (ref.field) return { docs: [...rows(ref.name)].filter(([id, row]) => row.fingerprints?.[ref.field.split('.')[1]] === ref.value).map(([id,row]) => snapshot(id,row)) };
        const value = rows(ref.name).get(ref.id);
        return snapshot(ref.id, pauseDuringTransaction && ref.name.endsWith('profiles') ? { ...value, attendanceEnabled: false } : value);
    }, set(ref, value) { writes.push([ref, value]); }, update(ref, value) { writes.push([ref, { ...rows(ref.name).get(ref.id), ...value }]); } });
    transactionCommits.push(writes);
    for (const [ref, value] of writes) rows(ref.name).set(ref.id, value);
    return result;
} };
require.cache[require.resolve('../firebase')] = { exports: { db, isAvailable: () => true } };
require.cache[require.resolve('../utils/whatsappService')] = { exports: { sendEventNotification() {} } };
const { getEnvCol } = require('../utils/collectionUtils');
const cleanupCalls = [];
require.cache[require.resolve('../services/enrollmentImageCleanup')] = { exports: { async cleanupEnrollmentImages(...args) { cleanupCalls.push({ args, commits: transactionCommits.length }); } } };
const engine = require('../services/attendanceDecisionEngine');
const seed = () => {
    for (const name of ['profiles', 'attendance_events', 'attendance']) collections.set(getEnvCol(name), new Map());
    rows(getEnvCol('profiles')).set('p1', { id: 'p1', name: 'Employee', type: 'Staff', attendanceEnabled: true });
    reads = 0; transactionCommits = []; pauseDuringTransaction = false; cleanupCalls.length = 0;
};
test.beforeEach(seed);
test('HTTP roster polling shares one listener and deletion changes cached snapshot', async () => {
    assert.equal((await engine.getTerminalRoster()).staff.length, 1);
    await engine.getTerminalRoster(); await engine.getTerminalRoster();
    assert.equal(subscriptions, 1);
    assert.equal(reads, 0);
    rows(getEnvCol('profiles')).delete('p1'); listener();
    assert.equal((await engine.getTerminalRoster()).staff.length, 0);
});
test('accepted punch commits exactly four documents together with point reads only', async () => {
    const result = await engine.processEvent({ employeeId: 'p1', action: 'CHECK_IN', isTest: true });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(transactionCommits.length, 1);
    assert.equal(transactionCommits[0].length, 4);
    assert.equal(reads, 4); // Profile, two summary IDs on first punch, transaction profile recheck.
});
test('pause racing with a scan aborts attendance transaction and writes only a stopped audit', async () => {
    pauseDuringTransaction = true;
    const result = await engine.processEvent({ employeeId: 'p1', action: 'CHECK_IN', isTest: true });
    assert.equal(result.status, 'ATTENDANCE_STOPPED');
    assert.equal(transactionCommits.length, 0);
    assert.equal(rows(getEnvCol('attendance')).size, 0);
    assert.equal(rows(getEnvCol('attendance_events')).size, 1);
});

test('enrollment replacement cleans images only after successful metadata commit', async () => {
    rows(getEnvCol('profiles')).get('p1').photos = ['/api/terminal/enrollment-images/p1/aaa.jpg'];
    await engine.enrollPerson({ id: 'p1', photos: ['/api/terminal/enrollment-images/p1/bbb.jpg'] });
    assert.equal(cleanupCalls.length, 1);
    assert.equal(cleanupCalls[0].commits, 1);
    assert.deepEqual(cleanupCalls[0].args[1].photos, ['/api/terminal/enrollment-images/p1/aaa.jpg']);
    await assert.rejects(() => engine.enrollPerson({ id: 'missing', photos: ['/api/terminal/enrollment-images/missing/bbb.jpg'] }));
    assert.equal(cleanupCalls.length, 1);
});
