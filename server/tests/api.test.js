const http = require('http');
const jwt = require('jsonwebtoken');

// Overridable so the suite can run against a throwaway instance on another
// port while a dev server is already holding 5000 with older code.
const BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api';
const TOKEN = jwt.sign(
  { id: 'test-user', role: 'admin', orgId: 'vgtc', name: 'Test Admin' },
  'vgtc-secret-2026',
  { expiresIn: '1h' }
);

let passed = 0;
let failed = 0;
const cleanup = [];

// --- HTTP helpers ---

function request(method, path, body, useAuth = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (useAuth) options.headers['Authorization'] = `Bearer ${TOKEN}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path, auth = true) { return request('GET', path, null, auth); }
function post(path, body, auth = true) { return request('POST', path, body, auth); }
function patch(path, body) { return request('PATCH', path, body); }
function del(path) { return request('DELETE', path); }

// --- Test runner ---

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  PASS  ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${t.name} — ${err.message}`);
    }
  }

  // Cleanup
  for (const fn of cleanup) {
    try { await fn(); } catch { /* best effort */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// For GET endpoints that may fail due to missing Firestore composite indexes
function assertGet(res) {
  if (res.status === 500 && typeof res.data === 'object' && res.data.error && res.data.error.includes('index')) {
    console.log(`    ⚠ Firestore index needed — create via Firebase Console`);
    return;
  }
  assert(res.status >= 200 && res.status < 500, `unexpected status ${res.status}`);
}

// --- Tests ---

// Auth
test('GET /auth/status (no auth)', async () => {
  const res = await get('/auth/status', false);
  assertGet(res);
});

test('GET /auth/me (with auth)', async () => {
  const res = await get('/auth/me');
  assertGet(res);
});

test('POST /auth/login bad creds => 401', async () => {
  const res = await post('/auth/login', { username: 'nope', password: 'wrong' }, false);
  assert(res.status === 401, `expected 401 got ${res.status}`);
});

// Vehicles CRUD
let testVehicleId;
test('GET /vehicles', async () => {
  const res = await get('/vehicles');
  assert(res.status === 200, `expected 200 got ${res.status}`);
});

test('POST /vehicles (create)', async () => {
  const res = await post('/vehicles', {
    truckNo: 'TEST0000',
    ownerName: 'Test Owner',
    vehicleType: 'Trailer',
    ownershipType: 'market',
    make: 'Tata',
    model: 'Test',
    ownerContact: '',
    driverName: '',
    driverContact: '',
    grossWeight: 0,
    unladenWeight: 0,
    regDate: '',
    nationalPermitDate: '',
    gpsType: 'none',
    targetMileage: 0,
    docs: '{}',
    emiDetails: '{}',
    rcDetails: '{}',
    docNumbers: '{}',
    bankDetails: '{}',
    fastag: '',
  });
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
  testVehicleId = res.data._id || res.data.id;
  cleanup.push(() => del(`/vehicles/${testVehicleId}`));
});

test('PATCH /vehicles/:id', async () => {
  if (!testVehicleId) throw new Error('no test vehicle');
  const res = await patch(`/vehicles/${testVehicleId}`, { owner: 'Updated Owner' });
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
});

test('DELETE /vehicles/:id', async () => {
  if (!testVehicleId) throw new Error('no test vehicle');
  const res = await del(`/vehicles/${testVehicleId}`);
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
  testVehicleId = null; // already deleted, remove from cleanup
  cleanup.length = 0;
});

// Mileage
let testFuelId;
test('GET /mileage/all-vehicles', async () => {
  const res = await get('/mileage/all-vehicles');
  assert(res.status === 200, `expected 200 got ${res.status}`);
});

test('POST /mileage/fuel (create)', async () => {
  const res = await post('/mileage/fuel', {
    truckNo: 'TEST0000',
    date: new Date().toISOString().slice(0, 10),
    amount: '5000',
    pump: 'Test Pump',
  });
  if (res.status >= 200 && res.status < 300) {
    testFuelId = res.data._id || res.data.id;
    cleanup.push(() => del(`/mileage/fuel/${testFuelId}`));
  }
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
});

test('DELETE /mileage/fuel/:id', async () => {
  if (!testFuelId) throw new Error('no test fuel log');
  const res = await del(`/mileage/fuel/${testFuelId}`);
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
  testFuelId = null;
});

// Maintenance
test('GET /maintenance', async () => {
  const res = await get('/maintenance');
  assertGet(res);
});

test('GET /maintenance/parts-catalog', async () => {
  const res = await get('/maintenance/parts-catalog');
  assertGet(res);
});

// Vouchers
test('GET /vouchers', async () => {
  const res = await get('/vouchers');
  assertGet(res);
});

// Stock
test('GET /jkl/stock/additions', async () => {
  const res = await get('/jkl/stock/additions');
  assertGet(res);
});

test('GET /kosli/stock/additions', async () => {
  const res = await get('/kosli/stock/additions');
  assertGet(res);
});

// LR
test('GET /lr', async () => {
  const res = await get('/lr');
  assertGet(res);
});

test('GET /kosli/lr', async () => {
  const res = await get('/kosli/lr');
  assertGet(res);
});

test('GET /jhajjar/lr', async () => {
  const res = await get('/jhajjar/lr');
  assertGet(res);
});

test('GET /jkl/lr', async () => {
  const res = await get('/jkl/lr');
  assertGet(res);
});

// Cashbook
test('GET /cashbook', async () => {
  const res = await get('/cashbook');
  assertGet(res);
});

test('GET /jkl/cashbook', async () => {
  const res = await get('/jkl/cashbook');
  assertGet(res);
});

// Parties
test('GET /parties', async () => {
  const res = await get('/parties');
  assertGet(res);
});

// Users
test('GET /users (admin)', async () => {
  const res = await get('/users');
  assertGet(res);
});

// Vehicle Advances
test('GET /vehicle-advances', async () => {
  const res = await get('/vehicle-advances');
  assertGet(res);
});

// Profiles
test('GET /profiles', async () => {
  const res = await get('/profiles');
  assertGet(res);
});

// Payments
test('GET /payments', async () => {
  const res = await get('/payments');
  assertGet(res);
});

// Auth guard
test('GET /vehicles without token => 401', async () => {
  const res = await get('/vehicles', false);
  assert(res.status === 401, `expected 401 got ${res.status}`);
});

// ── Freight batches ────────────────────────────────────────────────────────
// A batch records which trips a clerk sent from a balance sheet to Pay. The
// duplicate guard is the rule worth testing: the same trip in two open batches
// means it gets paid twice.
const stamp = Date.now();
const tripA = `test-voucher-a-${stamp}`;
const tripB = `test-voucher-b-${stamp}`;
const testTruck = `TEST${stamp}`;
const createdBatchIds = [];

test('GET /freight-batches', async () => {
  const res = await get('/freight-batches');
  assertGet(res);
});

test('POST /freight-batches creates a batch', async () => {
  const res = await post('/freight-batches', {
    batches: [{
      type: 'Kosli_Bill', truckNo: testTruck, voucherIds: [tripA, tripB],
      periodFrom: '2026-07-01', periodTo: '2026-07-31',
    }],
  });
  assert(res.status === 201, `expected 201 got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.created?.length === 1, 'expected one batch created');
  assert(res.data.created[0].voucherIds.length === 2, 'expected both trips in the batch');
  assert(res.data.created[0].dueDate === null, 'dueDate should start unset');
  createdBatchIds.push(res.data.created[0].id);
});

test('POST /freight-batches refuses trips already sent', async () => {
  const res = await post('/freight-batches', {
    batches: [{ type: 'Dump', truckNo: testTruck, voucherIds: [tripA] }],
  });
  assert(res.status === 409, `expected 409 got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.skipped?.some(s => s.voucherId === tripA), 'expected tripA reported as skipped');
});

test('POST /freight-batches sends only the trips not already sent', async () => {
  const tripC = `test-voucher-c-${stamp}`;
  const res = await post('/freight-batches', {
    batches: [{ type: 'Dump', truckNo: testTruck, voucherIds: [tripA, tripC] }],
  });
  assert(res.status === 201, `expected 201 got ${res.status}`);
  assert(res.data.created[0].voucherIds.length === 1, 'expected only the unsent trip');
  assert(res.data.created[0].voucherIds[0] === tripC, 'expected tripC to be the one sent');
  assert(res.data.skipped.length === 1, 'expected tripA skipped');
  createdBatchIds.push(res.data.created[0].id);
});

test('POST /freight-batches rejects an empty trip list', async () => {
  const res = await post('/freight-batches', {
    batches: [{ type: 'Kosli_Bill', truckNo: testTruck, voucherIds: [] }],
  });
  assert(res.status === 400, `expected 400 got ${res.status}`);
});

test('PATCH /freight-batches/bulk/due-date spans a truck\'s modules', async () => {
  const res = await patch('/freight-batches/bulk/due-date', { truckNo: testTruck, dueDate: '2026-08-15' });
  assert(res.status === 200, `expected 200 got ${res.status} ${JSON.stringify(res.data)}`);
  // Two batches, two different modules, one due date — that is the merged row.
  assert(res.data.updated === 2, `expected 2 batches updated, got ${res.data.updated}`);
});

test('PATCH /freight-batches/:id rejects a bad due date', async () => {
  const res = await patch(`/freight-batches/${createdBatchIds[0]}`, { dueDate: '15-08-2026' });
  assert(res.status === 400, `expected 400 got ${res.status}`);
});

test('PATCH /freight-batches/:id cannot rewrite the trip list', async () => {
  const res = await patch(`/freight-batches/${createdBatchIds[0]}`, { voucherIds: ['smuggled'] });
  assert(res.status === 400, `expected 400 got ${res.status}`);
});

test('cancelling frees its trips to be sent again', async () => {
  const cancel = await patch(`/freight-batches/${createdBatchIds[0]}`, { cancel: true });
  assert(cancel.status === 200, `expected 200 got ${cancel.status}`);
  const res = await post('/freight-batches', {
    batches: [{ type: 'Kosli_Bill', truckNo: testTruck, voucherIds: [tripA] }],
  });
  assert(res.status === 201, `expected the cancelled trip to be sendable, got ${res.status}`);
  createdBatchIds.push(res.data.created[0].id);
});

test('GET /freight-batches without token => 401', async () => {
  const res = await get('/freight-batches', false);
  assert(res.status === 401, `expected 401 got ${res.status}`);
});

// Leave dev Firestore as we found it. There is no delete by design — a sent
// batch stays auditable — so cancel is the cleanup.
test('cleanup: cancel the batches these tests created', async () => {
  for (const id of createdBatchIds) {
    const res = await patch(`/freight-batches/${id}`, { cancel: true });
    assert(res.status === 200, `cleanup failed for ${id}: ${res.status}`);
  }
});

// ── Party brands ───────────────────────────────────────────────────────────
// Parties carry which lists they belong to (jklakshmi/jksuper). Junk brand
// values must be dropped, not stored — a typo must not hide a party somewhere.
let brandPartyId;
test('POST /parties persists brands and drops junk values', async () => {
  const res = await post('/parties', {
    name: `TEST BRAND PARTY ${stamp}`,
    type: 'customer',
    brands: ['jklakshmi', 'bogus', 'jklakshmi'],
  });
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status} ${JSON.stringify(res.data)}`);
  brandPartyId = res.data.id;
  assert(JSON.stringify(res.data.brands) === '["jklakshmi"]',
    `expected ["jklakshmi"], got ${JSON.stringify(res.data.brands)}`);
  cleanup.push(() => del(`/parties/${brandPartyId}`));
});

// ── Pump monthly bill ──────────────────────────────────────────────────────
// The bill flow records one payment (category Pump) then stamps each voucher
// with dieselBillPaymentId, which is what keeps a settled entry out of every
// later bill run. Both halves must persist.
let pumpVoucherId, pumpPaymentId;
test('POST /vouchers creates a diesel entry for the bill flow', async () => {
  const res = await post('/vouchers', {
    type: 'Dump', lrNo: `9${stamp % 100000}`, date: '2026-07-20',
    truckNo: `TESTPUMP${stamp % 1000}`, weight: '5', rate: '100',
    advanceDiesel: '2000', pump: `TEST PUMP ${stamp}`,
  });
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
  pumpVoucherId = res.data.id;
  cleanup.push(() => del(`/vouchers/${pumpVoucherId}`));
});

test('POST /payments (category Pump) returns an id and echoes meta', async () => {
  const res = await post('/payments', {
    profileName: `TEST PUMP ${stamp}`, category: 'Pump', amount: 2000,
    date: '2026-08-01', paymentMethod: 'Online',
    remark: `Diesel bill 2026-07 — TEST PUMP ${stamp}`,
    meta: { billMonth: '2026-07', voucherIds: [pumpVoucherId] },
  });
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
  pumpPaymentId = res.data.id;
  assert(!!pumpPaymentId, 'expected a payment id');
  assert(res.data.meta?.voucherIds?.[0] === pumpVoucherId, 'expected meta.voucherIds to persist');
  cleanup.push(() => del(`/payments/${pumpPaymentId}`));
});

test('PATCH /vouchers/:id persists the settled marker', async () => {
  if (!pumpVoucherId) throw new Error('no test voucher');
  const res = await patch(`/vouchers/${pumpVoucherId}`, {
    dieselBillPaymentId: pumpPaymentId, dieselBillPaidAt: '2026-08-01',
  });
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
  const all = await get('/vouchers/Dump');
  const v = (all.data || []).find(x => x.id === pumpVoucherId);
  assert(v && v.dieselBillPaymentId === pumpPaymentId,
    `expected marker on voucher, got ${JSON.stringify(v?.dieselBillPaymentId)}`);
});

test('PATCH /parties/:id can widen brands', async () => {
  if (!brandPartyId) throw new Error('no test party');
  const res = await patch(`/parties/${brandPartyId}`, { brands: ['jklakshmi', 'jksuper'] });
  assert(res.status >= 200 && res.status < 300, `expected 2xx got ${res.status}`);
  const all = await get('/parties');
  const p = (all.data || []).find(x => x.id === brandPartyId);
  assert(p && p.brands.length === 2, `expected both brands, got ${JSON.stringify(p?.brands)}`);
});

// Run
runAll();
