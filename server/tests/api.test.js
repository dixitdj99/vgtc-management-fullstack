const http = require('http');
const jwt = require('jsonwebtoken');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

// Overridable so the suite can run against a throwaway instance on another
// port while a dev server is already holding 5000 with older code.
const BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api';

/**
 * The suite used to require a server someone had already started, on a port
 * whose JWT secret happened to match the one below — so a clean checkout, or a
 * dev server started with a different secret, failed every test for reasons
 * that had nothing to do with the code. It now starts its own server when
 * nothing is listening, and stops it again at the end.
 */
const SECRET = process.env.JWT_SECRET || 'vgtc-secret-2026';
const TOKEN = jwt.sign(
  { id: 'test-user', role: 'admin', orgId: 'vgtc', name: 'Test Admin' },
  SECRET,
  { expiresIn: '1h' }
);

let ownServer = null;

const portOpen = (host, port) => new Promise((resolve) => {
  const s = net.connect({ host, port });
  s.setTimeout(800);
  s.on('connect', () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
  s.on('timeout', () => { s.destroy(); resolve(false); });
});

async function ensureServer() {
  const url = new URL(BASE);
  const port = Number(url.port || 80);
  if (await portOpen(url.hostname, port)) return;

  console.log(`  ..  nothing listening on ${url.hostname}:${port} — starting one for this run`);
  ownServer = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    // The token above is signed with SECRET, so the server has to verify with it.
    env: { ...process.env, PORT: String(port), JWT_SECRET: SECRET },
    stdio: 'ignore',
  });

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (await portOpen(url.hostname, port)) return;
  }
  throw new Error(`server did not come up on port ${port}`);
}

function stopServer() {
  if (ownServer) { ownServer.kill(); ownServer = null; }
}

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
  try {
    await ensureServer();
  } catch (e) {
    console.error(`  FAIL  could not start a server — ${e.message}`);
    process.exit(1);
  }

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

  stopServer();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// A crash must not leave an orphaned server holding the port.
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });

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

// ── Stock: set (water-damaged) bags ─────────────────────────────────────────
// The rule these protect: bags found in our godown leave the loadable stock,
// bags returned by a party do not (their LR already consumed them).

let setBagIds = [];

test('POST /jkl/stock/set-stock records bags found in the godown', async () => {
  const res = await post('/jkl/stock/set-stock', {
    material: 'PPC', quantity: 50, source: 'godown', date: '2026-07-30', remark: 'api-test',
  });
  assert(res.status === 201, `expected 201 got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.direction === 'in', `expected direction in, got ${res.data.direction}`);
  setBagIds.push(res.data.id);
  cleanup.push(() => del(`/jkl/stock/set-stock/${res.data.id}`));
});

test('POST /jkl/stock/set-stock refuses a party return with no truck or LR', async () => {
  const res = await post('/jkl/stock/set-stock', {
    material: 'PPC', quantity: 10, source: 'party_return',
  });
  assert(res.status === 400, `expected 400 got ${res.status}`);
});

test('POST /jkl/stock/set-stock accepts a party return and normalises the truck', async () => {
  const res = await post('/jkl/stock/set-stock', {
    material: 'PPC', quantity: 40, source: 'party_return',
    truckNo: 'hr55 ab1234', lrNo: '212', partyName: 'api test party', remark: 'api-test',
  });
  assert(res.status === 201, `expected 201 got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.truckNo === 'HR55AB1234', `truck not normalised: ${res.data.truckNo}`);
  setBagIds.push(res.data.id);
  cleanup.push(() => del(`/jkl/stock/set-stock/${res.data.id}`));
});

test('POST /jkl/stock/set-stock rejects an unknown material', async () => {
  const res = await post('/jkl/stock/set-stock', { material: 'NOT_A_MATERIAL', quantity: 5, source: 'godown' });
  assert(res.status === 400, `expected 400 got ${res.status}`);
});

test('GET /kosli/stock/set-stock is org-scoped and reachable', async () => {
  // Guards the mount-order bug that left these handlers above the tenancy
  // middleware, so every query ran with an undefined orgId.
  const res = await get('/kosli/stock/set-stock');
  assert(res.status === 200, `expected 200 got ${res.status} ${JSON.stringify(res.data)}`);
  assert(Array.isArray(res.data), 'expected an array');
});

test('GET /stock/additions — the dump stock router is mounted', async () => {
  const res = await get('/stock/additions');
  assert(res.status === 200, `expected 200 got ${res.status} — is /api/stock mounted?`);
});

// ── Sell: cash in hand, and the cash-only cashbook rule ─────────────────────

let sellCashId = null, sellOnlineId = null, sellMoveId = null;

const cashInHand = async () => (await get('/sell/cash-movements?brand=dump')).data.cashInHand;

test('POST /sell stores the account for an online payment only', async () => {
  const online = await post('/sell', {
    material: 'PPC', quantity: 2, rate: 100, brand: 'dump', customerName: 'API Test Online',
    paymentType: 'online', paymentStatus: 'paid', onlineAccount: 'API Test Account',
  });
  assert(online.status >= 200 && online.status < 300, `expected 2xx got ${online.status}`);
  assert(online.data.onlineAccount === 'API Test Account', `account not stored: ${online.data.onlineAccount}`);
  sellOnlineId = online.data.id;
  cleanup.push(() => del(`/sell/${sellOnlineId}?brand=dump`));

  const cash = await post('/sell', {
    material: 'PPC', quantity: 2, rate: 100, brand: 'dump', customerName: 'API Test Cash',
    paymentType: 'cash', paymentStatus: 'paid', onlineAccount: 'should not stick',
  });
  assert(cash.data.onlineAccount === '', `cash sale kept an account: ${cash.data.onlineAccount}`);
  sellCashId = cash.data.id;
  cleanup.push(() => del(`/sell/${sellCashId}?brand=dump`));
});

test('cash in hand counts cash sales and ignores online ones', async () => {
  // Both sales above are ₹200; only the cash one may reach the cash box.
  const before = await cashInHand();
  assert(typeof before === 'number', 'cashInHand not returned');
  const res = await post('/sell/cash-movements', { type: 'to_cashbook', amount: before + 1, brand: 'dump', remark: 'api-test over cap' });
  assert(res.status === 400, `expected 400 over the cap, got ${res.status}`);
  assert(/cash is in hand/i.test(res.data.error || ''), `unexpected error: ${res.data.error}`);
});

test('POST /sell/cash-movements withdraws cash without touching the cashbook', async () => {
  const before = await cashInHand();
  if (before < 100) throw new Error(`not enough cash in hand to test (${before})`);
  const cbBefore = ((await get('/cashbook')).data || []).length;

  const res = await post('/sell/cash-movements', { type: 'withdrawal', amount: 100, brand: 'dump', remark: 'api-test wd' });
  assert(res.status === 201, `expected 201 got ${res.status} ${JSON.stringify(res.data)}`);
  sellMoveId = res.data.id;

  assert(await cashInHand() === before - 100, 'cash in hand did not drop by the withdrawal');
  const cbAfter = ((await get('/cashbook')).data || []).length;
  assert(cbAfter === cbBefore, 'a withdrawal must not create a cashbook entry');

  const gone = await del(`/sell/cash-movements/${sellMoveId}`);
  assert(gone.status === 200, `withdrawal should be deletable, got ${gone.status}`);
  sellMoveId = null;
});

// ── Tyres ───────────────────────────────────────────────────────────────────

test('GET /tyres is reachable', async () => {
  const res = await get('/tyres');
  assert(res.status === 200, `expected 200 got ${res.status}`);
  assert(Array.isArray(res.data), 'expected an array');
});

test('POST /tyres/auto-fit-apollo is gone', async () => {
  const res = await post('/tyres/auto-fit-apollo', {});
  assert(res.status === 404, `expected 404 for the removed endpoint, got ${res.status}`);
});

// ── Invoices ────────────────────────────────────────────────────────────────

test('GET /invoices is reachable', async () => {
  const res = await get('/invoices');
  assertGet(res);
});

test('POST /invoices/generate refuses a plant whose config is still TBD', async () => {
  const res = await post('/invoices/generate', {
    billNo: 'API-TEST-1', billDate: '2026-07-30', plantKey: 'kosli_dump', gstRate: 6,
    items: [{ lrNo: 'API-TEST-LR', billedQty: 1, ratePMT: 100 }],
  });
  assert(res.status === 400, `expected 400 got ${res.status}`);
  assert(/not available yet/i.test(res.data.error || ''), `unexpected error: ${res.data.error}`);
});

test('POST /invoices/generate refuses an entry that is not in the Balance Sheet', async () => {
  const res = await post('/invoices/generate', {
    billNo: 'API-TEST-2', billDate: '2026-07-30', plantKey: 'jksuper_jharli', gstRate: 9,
    items: [{ lrNo: 'NO-SUCH-LR-99999', billedQty: 1, ratePMT: 100 }],
  });
  assert(res.status === 409, `expected 409 got ${res.status} ${JSON.stringify(res.data)}`);
  assert(Array.isArray(res.data.missingLrs) && res.data.missingLrs.length === 1,
    `expected the missing LR to be named, got ${JSON.stringify(res.data.missingLrs)}`);
});

// ── Permissions are enforced by the server, not just the browser ────────────
//
// Until the gate was added, only attendanceRoutes checked permissions: a user
// granted *view* on the cashbook could POST a deposit straight to the API.
// These sign their own tokens so a real user record is not needed.

const asUser = (permissions, role = 'user') => jwt.sign(
  { id: 'perm-test-user', role, orgId: 'vgtc', name: 'Perm Test', permissions },
  SECRET, { expiresIn: '1h' }
);

function requestAs(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-org-id': 'vgtc' },
    }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const deposit = { amount: 1, remark: 'perm-test probe', date: '2026-07-31' };

test('view permission allows reads but refuses writes', async () => {
  const t = asUser({ cashbook: 'view' });
  const read = await requestAs(t, 'GET', '/cashbook');
  assert(read.status === 200, `expected 200 on read, got ${read.status}`);
  const write = await requestAs(t, 'POST', '/cashbook/deposit', deposit);
  assert(write.status === 403, `a view-only user must not be able to deposit — got ${write.status}`);
});

test('edit permission allows writes', async () => {
  const t = asUser({ cashbook: 'edit' });
  const write = await requestAs(t, 'POST', '/cashbook/deposit', deposit);
  assert(write.status >= 200 && write.status < 300, `expected 2xx, got ${write.status} ${write.data}`);
  try {
    const id = JSON.parse(write.data).id;
    if (id) cleanup.push(() => requestAs(asUser({}, 'admin'), 'DELETE', `/cashbook/${id}`));
  } catch { /* nothing to clean */ }
});

test('no permission refuses even reads', async () => {
  const t = asUser({});
  const read = await requestAs(t, 'GET', '/cashbook');
  assert(read.status === 403, `expected 403, got ${read.status}`);
});

test('admins bypass the gate', async () => {
  const t = asUser({}, 'admin');
  const read = await requestAs(t, 'GET', '/cashbook');
  assert(read.status === 200, `admin read should pass, got ${read.status}`);
});

test('the gate accepts any one of a multi-key route', async () => {
  // /vouchers answers for every voucher and balance module, so holding one is enough.
  const t = asUser({ balance_kosli: 'view' });
  const read = await requestAs(t, 'GET', '/vouchers');
  assert(read.status === 200, `expected 200 holding balance_kosli, got ${read.status}`);
});

test('permission catalogue covers every nav key', async () => {
  // The guard for the bug this replaced: `attendance` and `lr_dump` were
  // enforced by the app but missing from the admin screens, so they could not
  // be granted at all.
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..', 'client', 'src');
  const nav = fs.readFileSync(path.join(root, 'App.jsx'), 'utf8');
  const cat = fs.readFileSync(path.join(root, 'permissions', 'catalogue.js'), 'utf8');
  const navKeys = [...new Set([...nav.matchAll(/permKey:\s*'([^']+)'/g)].map(m => m[1]))];
  const catKeys = new Set([...cat.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]));
  const missing = navKeys.filter(k => !catKeys.has(k));
  assert(missing.length === 0, `nav keys missing from the catalogue: ${missing.join(', ')}`);
});

/* ── Voucher extra-money lines ──────────────────────────────────────────────
 *
 * A voucher can now carry several extras, each with its own remark, while
 * `extraCash` stays the total. Every net calculation in the app still reads
 * that one field, so these tests guard the invariant the whole design rests
 * on: the total must never drift from the list.
 */

// The client helper is an ES module; load it the way the bundler would.
const loadClientExtras = () => {
  const { pathToFileURL } = require('url');
  const p = require('path').join(__dirname, '..', '..', 'client', 'src', 'utils', 'voucherExtras.js');
  return import(pathToFileURL(p).href);
};

test('extras: a voucher saved before the list reads back as one line', async () => {
  const { readExtras } = await loadClientExtras();
  const rows = readExtras({ extraCash: '500', extraCashRemark: 'grease ke paise' });
  assert(rows.length === 1, `expected 1 line, got ${rows.length}`);
  assert(rows[0].amount === '500', `amount lost: ${rows[0].amount}`);
  assert(rows[0].remark === 'grease ke paise', `remark lost: ${rows[0].remark}`);
});

test('extras: extraCash stays the total of the list', async () => {
  const { extrasPayload } = await loadClientExtras();
  const out = extrasPayload([
    { amount: '500', remark: 'grease' },
    { amount: 200, remark: 'dhaba' },
  ]);
  assert(out.extraCash === 700, `total should be 700, got ${out.extraCash}`);
  assert(out.extras.length === 2, `expected 2 extras, got ${out.extras.length}`);
  assert(out.extraCashRemark === 'grease; dhaba', `remarks not joined: ${out.extraCashRemark}`);
});

test('extras: clearing the last line clears the legacy pair too', async () => {
  const { extrasPayload } = await loadClientExtras();
  const out = extrasPayload([]);
  // A stale extraCash here would keep deducting money the user just removed.
  assert(out.extraCash === '', `extraCash should be blank, got ${JSON.stringify(out.extraCash)}`);
  assert(out.extraCashRemark === '', `remark should be blank, got ${out.extraCashRemark}`);
  assert(out.extras.length === 0, 'extras should be empty');
});

test('extras: blank rows an open form leaves behind are dropped', async () => {
  const { extrasPayload } = await loadClientExtras();
  const out = extrasPayload([{ amount: '300', remark: 'toll' }, { amount: '', remark: '' }]);
  assert(out.extras.length === 1, `expected 1 kept row, got ${out.extras.length}`);
  assert(out.extraCash === 300, `total should be 300, got ${out.extraCash}`);
});

test('extras: splitting one amount into two does not change what is owed', async () => {
  const { extrasPayload, readExtras, extrasTotal } = await loadClientExtras();
  const before = { extraCash: '700', extraCashRemark: 'grease and dhaba' };
  const after = { ...before, ...extrasPayload([{ amount: 500, remark: 'grease' }, { amount: 200, remark: 'dhaba' }]) };
  assert(extrasTotal(readExtras(after)) === extrasTotal(readExtras(before)),
    'the deduction changed when the amount was split into two lines');
});

test('extras: the PDF prints one row per extra, remark kept off the label', async () => {
  const { printableExtras } = require('../utils/voucherExtras');
  const rows = printableExtras({ extras: [{ amount: 500, remark: 'grease' }, { amount: 200, remark: '' }] });
  assert(rows.length === 2, `expected 2 rows, got ${rows.length}`);
  assert(rows[0].remark === 'grease', `remark lost: ${rows[0].remark}`);
  // A remark with no money behind it is a note, not a deduction.
  const noMoney = printableExtras({ extras: [{ amount: 0, remark: 'just a note' }] });
  assert(noMoney.length === 0, `a zero-amount extra should not print, got ${noMoney.length}`);
});

test('extras: the PDF still reads vouchers that predate the list', async () => {
  const { printableExtras } = require('../utils/voucherExtras');
  const rows = printableExtras({ extraCash: '450', extraCashRemark: 'extra diye hai grees ke' });
  assert(rows.length === 1 && rows[0].amount === 450, `legacy extra not read: ${JSON.stringify(rows)}`);
  assert(printableExtras({}).length === 0, 'a voucher with no extras should print none');
});

/* ── E-way bill feed ─────────────────────────────────────────────────────────
 *
 * NIC credentials take weeks to arrive, so none of this can be proved against
 * the real system yet. What can be proved is the part that would silently
 * create a challan against the wrong truck: the response envelope, and the
 * mapping from an e-way bill to the eight form fields.
 */

test('ewb: a NIC response round-trips through sek, rek and the HMAC', async () => {
  const crypto = require('crypto');
  const { _internal } = require('../utils/ewbClient');

  const sessionKey = crypto.randomBytes(32);
  const rek = crypto.randomBytes(32);
  const payload = { ewbNo: 151000256262, docNo: 'TA120' };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');

  const body = {
    rek: _internal.aesEncrypt(rek, sessionKey),
    data: _internal.aesEncrypt(Buffer.from(payloadB64), rek),
    hmac: crypto.createHmac('sha256', rek).update(payloadB64).digest('base64'),
  };

  const out = _internal.decryptResponse(body, sessionKey);
  assert(out.ewbNo === 151000256262, `ewbNo lost in transit: ${out.ewbNo}`);
  assert(out.docNo === 'TA120', `docNo lost in transit: ${out.docNo}`);
});

test('ewb: a tampered response is refused, not parsed', async () => {
  const crypto = require('crypto');
  const { _internal } = require('../utils/ewbClient');

  const sessionKey = crypto.randomBytes(32);
  const rek = crypto.randomBytes(32);
  const payloadB64 = Buffer.from(JSON.stringify({ ewbNo: 1 })).toString('base64');

  const body = {
    rek: _internal.aesEncrypt(rek, sessionKey),
    data: _internal.aesEncrypt(Buffer.from(payloadB64), rek),
    // The HMAC of a different payload — what a swapped response looks like.
    hmac: crypto.createHmac('sha256', rek).update('not-the-payload').digest('base64'),
  };

  let threw = false;
  try { _internal.decryptResponse(body, sessionKey); } catch { threw = true; }
  assert(threw, 'a failed HMAC must throw — returning the data would create a challan from it');
});

/** A GetEwayBill response shaped like the NIC sample, with cement on it. */
const ewbFixture = (over = {}) => ({
  ewbNo: 151000256262,
  docNo: '7330200286',
  docDate: '01/08/2026',
  fromTrdName: 'JK Cement Plant',
  toTrdName: 'Sai Building Material',
  toGstin: '06ALDPA4968K1ZZ',
  toPlace: 'Sohna',
  totInvValue: 19100.0,
  validUpto: '03/08/2026 11:59:00 PM',
  itemList: [{ productName: 'JK SUPER PPC CEMENT', hsnCode: 252329, quantity: 2.5, qtyUnit: 'MT' }],
  VehiclListDetails: [{ vehicleNo: 'HR47G9999' }],
  ...over,
});

const MATS = ['PPC', 'OPC43', 'Adstar', 'OPC FS', 'OPC53 FS', 'Weather'];

test('ewb: a bill fills seven of the eight challan fields', async () => {
  const { toChallanDraft } = require('../utils/ewbService');
  const d = toChallanDraft(ewbFixture(), { materials: MATS });

  assert(d.truckNo === 'HR47G9999', `truck: ${d.truckNo}`);
  assert(d.material === 'PPC', `"JK SUPER PPC CEMENT" should match PPC, got ${d.material}`);
  assert(d.quantity === 50, `2.5 MT is 50 bags, got ${d.quantity}`);
  assert(d.partyName === 'Sai Building Material', `party: ${d.partyName}`);
  assert(d.partyCode === '06ALDPA4968K1ZZ', `party code: ${d.partyCode}`);
  assert(d.billNo === '7330200286', `bill no: ${d.billNo}`);
  assert(d.date === '2026-08-01', `01/08/2026 should become 2026-08-01, got ${d.date}`);
  assert(d.needsReview.length === 0, `nothing should need review: ${d.needsReview.join(', ')}`);
});

test('ewb: bags pass through unconverted when the plant already counted bags', async () => {
  const { toChallanDraft } = require('../utils/ewbService');
  const d = toChallanDraft(
    ewbFixture({ itemList: [{ productName: 'PPC', quantity: 50, qtyUnit: 'BAGS' }] }),
    { materials: MATS });
  // The MT rule would have turned 50 bags into 1000 — the worst kind of wrong,
  // because it looks like a real number.
  assert(d.quantity === 50, `50 bags should stay 50, got ${d.quantity}`);
});

test('ewb: a longer material name wins over a shorter one it contains', async () => {
  const { _internal } = require('../utils/ewbService');
  assert(_internal.matchMaterial('OPC 53 FS CEMENT', MATS) === 'OPC53 FS',
    'OPC53 FS must not lose to OPC FS');
  assert(_internal.matchMaterial('OPC 43 GRADE', MATS) === 'OPC43', 'OPC43 not matched');
});

test('ewb: a bill with no Part-B vehicle says so instead of guessing', async () => {
  const { toChallanDraft } = require('../utils/ewbService');
  const d = toChallanDraft(ewbFixture({ VehiclListDetails: [] }), { materials: MATS });
  assert(d.truckNo === '', `truck should be blank, got "${d.truckNo}"`);
  assert(d.needsReview.some(r => /Part-B|truck/i.test(r)), `expected a truck warning: ${d.needsReview}`);
});

test('ewb: an unrecognised product is flagged rather than mapped to something', async () => {
  const { toChallanDraft } = require('../utils/ewbService');
  const d = toChallanDraft(
    ewbFixture({ itemList: [{ productName: 'WHITE PUTTY', quantity: 1, qtyUnit: 'MT' }] }),
    { materials: MATS });
  assert(d.material === '', `should not have picked a material, got ${d.material}`);
  assert(d.needsReview.some(r => /WHITE PUTTY/.test(r)), `expected it named: ${d.needsReview}`);
});

test('ewb: Part-B updates mean the latest vehicle is the current one', async () => {
  const { _internal } = require('../utils/ewbService');
  const no = _internal.currentVehicle({
    VehiclListDetails: [{ vehicleNo: 'HR47G9999' }, { vehicleNo: 'HR63B8291' }],
  });
  assert(no === 'HR63B8291', `should take the last vehicle, got ${no}`);
});

test('ewb: a multi-item bill maps to materials[] for createChallan', async () => {
  const { toChallanDraft } = require('../utils/ewbService');
  const d = toChallanDraft(ewbFixture({
    itemList: [
      { productName: 'PPC', quantity: 2, qtyUnit: 'MT' },
      { productName: 'OPC 43', quantity: 1, qtyUnit: 'MT' },
    ],
  }), { materials: MATS });
  assert(d.materials.length === 2, `expected 2 materials, got ${d.materials.length}`);
  assert(d.quantity === 60, `2 MT + 1 MT is 60 bags, got ${d.quantity}`);
});

test('ewb: re-syncing the same bill does not create a second draft', async () => {
  // The whole point of keying on ewbNo. A half-hourly sync over the same day
  // would otherwise stack up a fresh copy of every load.
  const store = require('../utils/ewbStore');
  const col = 'test_eway_bills_' + Math.abs(Date.now() % 100000);
  const bill = { ewbNo: '151000256262', docNo: 'TA120', detail: ewbFixture() };

  const first = await store.upsertBill('vgtc', bill, col);
  const second = await store.upsertBill('vgtc', bill, col);
  assert(first.created === true, 'first sync should create the bill');
  assert(second.created === false, 'second sync must not create it again');

  const list = await store.listBills('vgtc', col);
  assert(list.length === 1, `expected 1 stored bill, got ${list.length}`);
});

test('ewb: a resync does not drag a used bill back into the pending list', async () => {
  const store = require('../utils/ewbStore');
  const col = 'test_eway_used_' + Math.abs(Date.now() % 100000);
  const bill = { ewbNo: '151000999999', docNo: 'TA999', detail: ewbFixture() };

  await store.upsertBill('vgtc', bill, col);
  await store.setStatus('vgtc', '151000999999', 'used', col, 'challan-1');
  await store.upsertBill('vgtc', bill, col); // the next scheduled sync

  const pending = await store.listBills('vgtc', col, 'pending');
  assert(pending.length === 0, 'a used bill must not come back as pending');
});

test('ewb: with no credentials the feed is inert, not broken', async () => {
  const client = require('../utils/ewbClient');
  assert(client.isConfigured() === false, 'the test env has no EWB credentials');
  assert(client.missingConfig().length > 0, 'missingConfig should name what is absent');

  // 200 with configured:false — the yard sees "not connected", not a red error.
  const res = await get('/eway/pending');
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(res.data.configured === false, `expected configured:false, got ${JSON.stringify(res.data)}`);
  assert(Array.isArray(res.data.bills) && res.data.bills.length === 0, 'bills should be empty');

  const status = await get('/eway/status');
  assert(status.status === 200 && status.data.configured === false, 'status should report unconfigured');
  assert(Array.isArray(status.data.missing) && status.data.missing.length > 0,
    'status should name the missing configuration');
});

test('ewb: the whole wire protocol works against a NIC that encrypts for real', async () => {
  // Authenticate, decrypt sek, call two methods, verify two HMACs, map the
  // result. Without NIC credentials this is the closest thing to proof that
  // the transport is right, and it is the layer nothing else can check.
  const { startFakeNic } = require('./fakeNic');
  const nic = await startFakeNic();
  try {
    const ewbService = require('../utils/ewbService');
    assert(ewbService.isConfigured(), 'the fake NIC should have configured the client');

    const list = await ewbService.listForTransporter(new Date());
    assert(list.length === 1 && String(list[0].ewbNo) === '151000256262', `list: ${JSON.stringify(list)}`);

    const detail = await ewbService.getDetail('151000256262');
    const draft = ewbService.toChallanDraft(detail, { materials: MATS });
    assert(draft.truckNo === 'HR47G9999', `truck: ${draft.truckNo}`);
    assert(draft.quantity === 50, `bags: ${draft.quantity}`);
    assert(draft.needsReview.length === 0, `needsReview: ${draft.needsReview.join(', ')}`);
  } finally { nic.close(); }
});

test('ewb: a bill listed on both polled days is fetched once, not twice', async () => {
  // The fake returns the same bill for today and yesterday, which is exactly
  // what happens to a load generated late in the evening. Fetching its detail
  // twice would double every sync's NIC calls for no new information.
  const { startFakeNic } = require('./fakeNic');
  const nic = await startFakeNic();
  try {
    const ewbSync = require('../utils/ewbSync');
    const col = 'test_eway_dedupe_' + Math.abs(Date.now() % 100000);
    const r = await ewbSync.syncOrg('vgtc', { billsCol: col });
    assert(r.errors.length === 0, `sync errored: ${r.errors.join(' | ')}`);
    assert(nic.detailCalls() === 1, `expected 1 detail call, got ${nic.detailCalls()}`);
    assert(r.added === 1 && r.refreshed === 0, `expected 1 added 0 refreshed, got ${JSON.stringify(r)}`);

    // And a second sync should not fetch it again at all — it already has a vehicle.
    const again = await ewbSync.syncOrg('vgtc', { billsCol: col });
    assert(nic.detailCalls() === 1, `a resync refetched the detail: ${nic.detailCalls()} calls`);
    assert(again.added === 0, `resync should add nothing, got ${JSON.stringify(again)}`);
  } finally { nic.close(); }
});

test('ewb: the sync job is registered and no-ops without credentials', async () => {
  const { JOBS } = require('../jobs');
  assert(typeof JOBS['eway-sync'] === 'function', 'eway-sync must be in the JOBS registry');
  const result = await JOBS['eway-sync']();
  assert(result.status === 'ok', `job should succeed, got ${JSON.stringify(result)}`);
  assert(result.result?.skipped === true, 'it should skip, not attempt a call');
});

test('apphosting.yaml is valid, including duplicate keys', async () => {
  // A duplicate `availability:` under CRON_SECRET made App Hosting reject the
  // whole file, so two rollouts failed and production sat on an old bundle with
  // no error visible from the repo. A plain YAML load does NOT catch this — it
  // keeps the last duplicate and calls the file fine — so this parses by hand.
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'apphosting.yaml'), 'utf8');

  const entries = [];
  let current = null;
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^ {2}- (\w[\w-]*):/);
    if (item) { current = { keys: [item[1]], line: i + 1 }; entries.push(current); continue; }
    const key = line.match(/^ {4}(\w[\w-]*):/);
    if (key && current) current.keys.push(key[1]);
  }

  assert(entries.length > 0, 'no env entries were parsed — the check itself is broken');
  for (const e of entries) {
    const dupes = e.keys.filter((k, i) => e.keys.indexOf(k) !== i);
    assert(!dupes.length, `apphosting.yaml line ${e.line}: duplicate key(s) ${[...new Set(dupes)].join(', ')}`);
  }

  // Every env entry has to resolve to something, or the rollout fails the same
  // silent way. An empty value is the other shape that has caused trouble here.
  const envEntries = entries.filter(e => e.keys[0] === 'variable');
  for (const e of envEntries) {
    assert(e.keys.includes('value') || e.keys.includes('secret'),
      `apphosting.yaml line ${e.line}: env entry has neither a value nor a secret`);
  }
  const named = [...text.matchAll(/^ {2}- variable: (\w+)/gm)].map(m => m[1]);
  assert(named.includes('JWT_SECRET'), 'JWT_SECRET missing — the server refuses to start without it');
});

/* ── Online advances ──────────────────────────────────────────────────────── */

test('voucher: raising a paid online advance puts it back on the pay list', async () => {
  // `isOnlinePaid` is a bare flag with no record of the amount behind it. Paying
  // 3,000 and then raising the advance to 8,000 used to leave the flag standing,
  // so the extra 5,000 was owed to the driver while Pay -> Online showed nothing.
  const made = await post('/vouchers', {
    lrNo: '99801', date: '2026-08-01', truckNo: 'HR47G9999', partyName: 'Test',
    weight: '25', rate: '700', advanceOnline: '3000', type: 'Dump', brand: 'dump',
  });
  assert(made.status === 201, `create failed: ${made.status}`);
  const id = made.data.id;

  try {
    await patch('/vouchers/' + id, { isOnlinePaid: true, onlinePaidDate: '2026-08-01' });
    await patch('/vouchers/' + id, { advanceOnline: '8000' });

    const after = (await get('/vouchers')).data.find(v => v.id === id);
    assert(parseFloat(after.advanceOnline) === 8000, `amount: ${after.advanceOnline}`);
    assert(after.isOnlinePaid === false, 'the paid mark should have been cleared by the amount change');
    assert(!after.onlinePaidDate, `paid date should be cleared, got ${after.onlinePaidDate}`);
  } finally { await del('/vouchers/' + id); }
});

test('voucher: recording payment of a new amount in one patch is respected', async () => {
  // The clearing rule must not fight someone who changes the amount and marks it
  // paid together — that is a deliberate record of paying the new figure.
  const made = await post('/vouchers', {
    lrNo: '99802', date: '2026-08-01', truckNo: 'HR47G9999', partyName: 'Test',
    weight: '25', rate: '700', advanceOnline: '3000', type: 'Dump', brand: 'dump',
  });
  const id = made.data.id;
  try {
    await patch('/vouchers/' + id, { isOnlinePaid: true, onlinePaidDate: '2026-08-01' });
    await patch('/vouchers/' + id, { advanceOnline: '8000', isOnlinePaid: true, onlinePaidDate: '2026-08-02' });

    const after = (await get('/vouchers')).data.find(v => v.id === id);
    assert(after.isOnlinePaid === true, 'an explicit isOnlinePaid in the same patch must win');
  } finally { await del('/vouchers/' + id); }
});

test('voucher: an unpaid online advance is visible however the voucher is typed', async () => {
  // The pay screen used to ask for six named types, so anything else — a legacy
  // record, a future plant — carried an invisible advance.
  const made = await post('/vouchers', {
    lrNo: '99803', date: '2026-08-01', truckNo: 'HR47G9999', partyName: 'Test',
    weight: '25', rate: '700', advanceOnline: '4000', type: '', brand: 'dump',
  });
  const id = made.data.id;
  try {
    const all = (await get('/vouchers')).data;
    const seen = all.find(v => v.id === id);
    assert(seen, 'GET /vouchers must return it regardless of type');
    assert(parseFloat(seen.advanceOnline) > 0 && !seen.isOnlinePaid, 'it should count as unpaid');
  } finally { await del('/vouchers/' + id); }
});

/* ── Dump godowns: hidden modules vs the permissions they share ───────────── */

test('dump godowns hide the head-office modules but keep the permissions behind them', async () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..', 'client', 'src');
  const app = fs.readFileSync(path.join(root, 'App.jsx'), 'utf8');
  const cat = fs.readFileSync(path.join(root, 'permissions', 'catalogue.js'), 'utf8');

  const hidden = new Set([...app.matchAll(/^\s*'([a-z_]+)',\s*\/\/ /gm)].map(m => m[1]));
  for (const id of ['cashbook_dump', 'pay_dump', 'trip_profit_dump', 'vehicles_dump',
    'diesel_dump', 'mileage_dump', 'tyres_dump', 'vendors_dump', 'invoice_dump']) {
    assert(hidden.has(id), `${id} should be hidden at the dump godowns`);
  }

  // The trap this guards. Hiding a module is not revoking its permission: the
  // screens that remain at a dump read through these, and dropping one empties
  // the truck lists or the voucher's odometer lookup with no obvious cause.
  const shared = cat.match(/const DUMP_SHARED = \[([^\]]+)\]/);
  assert(shared, 'DUMP_SHARED is not defined in the catalogue');
  const keys = [...shared[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const [key, why] of [
    ['vehicle', 'the truck list on every LR, voucher and balance sheet'],
    ['mileage', "the voucher form's /mileage/last-km lookup"],
    ['pay', 'the freight batches a balance sheet reads'],
  ]) {
    assert(keys.includes(key), `DUMP_SHARED dropped "${key}" — that breaks ${why}`);
  }

  // And the ones that genuinely have no reader left should be gone.
  for (const key of ['cashbook', 'diesel', 'invoice']) {
    assert(!keys.includes(key), `DUMP_SHARED still offers "${key}", whose module is hidden here`);
  }
});

/* ── Exports and the Drive archive ────────────────────────────────────────── */

test('export rows keep every field, including one only some records carry', async () => {
  // The whole point. Exports used to take a hand-picked column list, so a
  // voucher's commission, tyre work and extra payments never left the app.
  const { toRows } = require('../utils/listBackupService');
  const { headers, rows } = toRows([
    { lrNo: '1', truckNo: 'HR47G9999', commission: 500 },
    { lrNo: '2', truckNo: 'HR63B8291', tyrePuncture: 100, billNo: 'B-9' },
  ]);
  for (const col of ['Lr No', 'Truck No', 'Commission', 'Tyre Puncture', 'Bill No']) {
    assert(headers.includes(col), `"${col}" was dropped — headers: ${headers.join(', ')}`);
  }
  assert(rows.length === 2, `expected 2 rows, got ${rows.length}`);
  // A field the first record lacks must still be blank rather than missing.
  assert(rows[0][headers.indexOf('Bill No')] === '', 'a absent field should be blank, not skipped');
});

test('export rows flatten nested detail instead of printing [object Object]', async () => {
  const { toRows } = require('../utils/listBackupService');
  const { headers, rows } = toRows([{
    lrNo: '1',
    extras: [{ amount: 500, remark: 'grease' }, { amount: 200, remark: 'dhaba' }],
    deliveries: [{ lrNo: '9', destination: 'Sohna' }],
  }]);
  const extras = String(rows[0][headers.indexOf('Extras')]);
  assert(extras.includes('500') && extras.includes('grease'),
    `extras lost their detail: ${extras}`);
  assert(!extras.includes('[object'), `extras were not flattened: ${extras}`);
  const dl = String(rows[0][headers.indexOf('Deliveries')]);
  assert(dl.includes('Sohna'), `deliveries lost their detail: ${dl}`);
});

test('archive folders give every module its own tree', async () => {
  const { folderPath } = require('../utils/archiveService');
  const when = new Date('2026-08-02T00:00:00Z');

  const lr = folderPath({ module: 'Loading Receipts', kind: 'Documents', plant: 'JK Lakshmi', when });
  assert(lr.join('/') === 'Loading Receipts/Documents/JK Lakshmi/2026-08', `LR path: ${lr.join('/')}`);

  const bs = folderPath({ module: 'Balance Sheet', kind: 'Statements', when });
  assert(bs.join('/') === 'Balance Sheet/Statements/2026-08', `statement path: ${bs.join('/')}`);

  // An unknown module must land somewhere real rather than create junk folders
  // from whatever a caller passed.
  const junk = folderPath({ module: 'Nonsense', kind: 'Nonsense', when });
  assert(junk[0] === 'Other' && junk[1] === 'Documents', `unknown module path: ${junk.join('/')}`);

  // A name that would nest a folder or break a Drive query gets neutralised.
  const { safeName } = require('../utils/archiveService');
  assert(!safeName('LR/12*3?').includes('/'), 'a slash in a name would silently nest a folder');
});

test('archiving refuses what it should and never throws at the caller', async () => {
  const archiveService = require('../utils/archiveService');

  const noHtml = await archiveService.archive({ module: 'Vouchers', name: 'x', html: '' });
  assert(noHtml.archived === false, 'an empty document should not be filed');

  const huge = await archiveService.archive({
    module: 'Vouchers', name: 'x', html: 'a'.repeat(archiveService.MAX_HTML_BYTES + 1),
  });
  assert(huge.archived === false && /too large/i.test(huge.reason), `oversized: ${JSON.stringify(huge)}`);

  // Drive is not connected in the test environment: that is a reported outcome,
  // not an error, or a printed slip would surface a red banner.
  const ok = await archiveService.archive({ module: 'Vouchers', name: 'x', html: '<p>hi</p>' });
  assert(ok.archived === false && /not connected/i.test(ok.reason || ''), `unauthorised: ${JSON.stringify(ok)}`);
});

test('the archive endpoint answers 200 whether or not Drive is up', async () => {
  const res = await post('/archive', { module: 'Vouchers', name: 'probe', html: '<p>x</p>' });
  assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.archived === false, `expected archived:false without Drive, got ${JSON.stringify(res.data)}`);

  const status = await get('/archive/status');
  assert(status.status === 200 && 'authorized' in status.data, 'status should report Drive connectivity');
});

test('weekly-lists is registered and covers every module folder', async () => {
  const { JOBS } = require('../jobs');
  assert(typeof JOBS['weekly-lists'] === 'function', 'weekly-lists must be in the JOBS registry');
  const result = await JOBS['weekly-lists']();
  assert(result.status === 'ok', `job should succeed, got ${JSON.stringify(result)}`);
  assert(result.result?.skipped === true, 'it should skip without Drive, not attempt uploads');

  const { LISTS, isoWeek } = require('../utils/listBackupService');
  const { MODULES } = require('../utils/archiveService');
  for (const l of LISTS) {
    assert(MODULES.has(l.module), `"${l.label}" files under unknown module "${l.module}"`);
  }
  // The lists nobody was backing up before.
  const covered = LISTS.map(l => l.collection);
  for (const c of ['challans', 'cashbook_entries', 'sales', 'invoices', 'tyres', 'vehicle_advances']) {
    assert(covered.includes(c), `"${c}" is still not backed up anywhere`);
  }
  assert(/^\d{4}-W\d{2}$/.test(isoWeek(new Date('2026-08-02'))), `week key: ${isoWeek(new Date('2026-08-02'))}`);
});

/* ── Column filters ───────────────────────────────────────────────────────── */

test('column filter: picking a value does not collapse the option list', async () => {
  // Every table passes the rows it is already showing, which are filtered. Once
  // a value was ticked those rows held only that value, so the dropdown shrank
  // to a single option and there was no way to add a second or switch without
  // clearing first.
  const { pathToFileURL } = require('url');
  const p = require('path').join(__dirname, '..', '..', 'client', 'src', 'components', 'ColumnFilter.jsx');
  const fs = require('fs');
  const src = fs.readFileSync(p, 'utf8');
  const start = src.indexOf('export function nextOptions');
  assert(start !== -1, 'nextOptions is not exported from ColumnFilter.jsx');
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  // eslint-disable-next-line no-new-func
  const nextOptions = new Function(
    `${src.slice(start, i + 1).replace('export function', 'function')}\nreturn nextOptions;`)();

  // Unfiltered first paint: the whole fleet.
  let store = nextOptions({ key: null, opts: [] },
    { colKey: 'truckNo', fromData: ['HR47G9999', 'HR63B8291', 'RJ14GA1234'], trustData: true });
  assert(store.opts.length === 3, `expected 3 trucks, got ${store.opts.length}`);

  // One ticked — the caller now only shows that truck's rows.
  store = nextOptions(store, { colKey: 'truckNo', fromData: ['HR47G9999'], trustData: false });
  assert(store.opts.length === 3,
    `the list collapsed to ${store.opts.length} — the user cannot pick a second truck`);

  // A trip for a truck we had not seen still appears.
  store = nextOptions(store, { colKey: 'truckNo', fromData: ['HR47G9999', 'HR55X1111'], trustData: false });
  assert(store.opts.includes('HR55X1111'), 'a genuinely new value must still get in');

  // Cleared: believe the data again, so stale values do not linger for ever.
  store = nextOptions(store, { colKey: 'truckNo', fromData: ['HR47G9999', 'HR63B8291'], trustData: true });
  assert(store.opts.length === 2, `expected the list to reset to 2, got ${store.opts.length}`);

  // A different column shares nothing with the last one.
  store = nextOptions(store, { colKey: 'partyName', fromData: ['Sai Building'], trustData: false });
  assert(store.opts.length === 1 && store.opts[0] === 'Sai Building',
    `switching column leaked old values: ${store.opts.join(', ')}`);
});

/* ── All-Over Balance Sheet ───────────────────────────────────────────────── */

const loadAllBalance = () => {
  const { pathToFileURL } = require('url');
  const p = require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AllBalanceSheet.jsx');
  // The module imports React and BalanceSheet, which cannot load here. The two
  // pure functions under test are plain JS, so pull them out and evaluate those.
  const fs = require('fs');
  const src = fs.readFileSync(p, 'utf8');
  const grab = (name) => {
    const start = src.indexOf(`export function ${name}`);
    assert(start !== -1, `${name} is not exported from AllBalanceSheet.jsx`);
    // Skip the parameter list before hunting for the body — a default like
    // `permissions = {}` otherwise looks exactly like the opening brace.
    let i = src.indexOf('(', start), parens = 0;
    for (; i < src.length; i++) {
      if (src[i] === '(') parens++;
      else if (src[i] === ')' && --parens === 0) { i++; break; }
    }
    let depth = 0;
    i = src.indexOf('{', i);
    const bodyStart = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    assert(bodyStart !== -1 && i < src.length, `could not read the body of ${name}`);
    return src.slice(start, i + 1).replace('export function', 'function');
  };
  const meta = src.slice(src.indexOf('export const TYPE_META'), src.indexOf('const fmtRs'))
    .replace('export const', 'const');
  // eslint-disable-next-line no-new-func
  return new Function(`${meta}\n${grab('visibleTypes')}\n${grab('groupIntoBatches')}\nreturn { TYPE_META, visibleTypes, groupIntoBatches };`)();
};

test('all-balance: every voucher type maps to a balance permission', async () => {
  // A type missing from the map is invisible on the combined sheet, and nothing
  // says so — the same shape of bug as the pay screen's hard-coded six.
  const { TYPE_META } = loadAllBalance();
  const TYPES = ['Kosli_Bill', 'Jajjhar_Bill', 'Bahadurgarh_Bill', 'Dump', 'JK_Lakshmi', 'JK_Super'];
  const missing = TYPES.filter(t => !TYPE_META[t]);
  assert(!missing.length, `types missing from TYPE_META: ${missing.join(', ')}`);

  const fs = require('fs');
  const path = require('path');
  const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'permissions', 'catalogue.js'), 'utf8');
  const catKeys = new Set([...cat.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]));
  for (const [type, meta] of Object.entries(TYPE_META)) {
    assert(catKeys.has(meta.permKey), `${type} maps to ${meta.permKey}, which is not in the catalogue`);
  }
  assert(catKeys.has('balance_all'), 'balance_all must be in the catalogue for the nav entry to be grantable');
});

test('all-balance: the combined sheet shows only plants the user already holds', async () => {
  // It is a convenience over the six sheets, not a way around them.
  const { visibleTypes } = loadAllBalance();
  assert(visibleTypes('admin', {}).length === 6, 'admin should see all six');

  const clerk = visibleTypes('user', { balance_kosli: 'view', balance_jkl: 'edit' });
  assert(clerk.length === 2, `expected 2 types, got ${clerk.join(', ')}`);
  assert(clerk.includes('Kosli_Bill') && clerk.includes('JK_Lakshmi'), `wrong types: ${clerk.join(', ')}`);

  // balance_all on its own grants the screen, not the data behind it.
  assert(visibleTypes('user', { balance_all: 'edit' }).length === 0,
    'balance_all alone must not reveal any plant');
});

test('all-balance: a mixed selection becomes one batch per plant and truck', async () => {
  // A batch belongs to a truck within a plant. Getting this wrong files a trip
  // under the wrong plant, and the sheet it came from never shows it as gone.
  const { groupIntoBatches } = loadAllBalance();
  const batches = groupIntoBatches([
    { id: 'a', type: 'Kosli_Bill', truckNo: 'HR47G9999', date: '2026-07-02' },
    { id: 'b', type: 'Kosli_Bill', truckNo: 'HR47G9999', date: '2026-07-20' },
    { id: 'c', type: 'JK_Lakshmi', truckNo: 'HR47G9999', date: '2026-07-11' },
    { id: 'd', type: 'Kosli_Bill', truckNo: 'HR63B8291', date: '2026-07-05' },
  ]);
  assert(batches.length === 3, `expected 3 batches, got ${batches.length}`);

  const same = batches.find(b => b.type === 'Kosli_Bill' && b.truckNo === 'HR47G9999');
  assert(same.voucherIds.length === 2, `expected 2 trips together, got ${same.voucherIds.length}`);
  // The period is taken from what was actually ticked, not from a preset.
  assert(same.periodFrom === '2026-07-02' && same.periodTo === '2026-07-20',
    `period wrong: ${same.periodFrom}..${same.periodTo}`);

  const other = batches.find(b => b.type === 'JK_Lakshmi');
  assert(other.voucherIds.length === 1 && other.voucherIds[0] === 'c', 'the other plant must be its own batch');
  assert(batches.every(b => b.type && b.truckNo && b.voucherIds.length),
    'every batch needs a type, a truck and trips — the API rejects it otherwise');
});

/* ── Cashbook: paying someone who is not on the roster ────────────────────── */

test('cashbook: a custom cash-out records the name without a roster profile', async () => {
  // Labourers, mechanics and one-off collectors have no driver or staff record,
  // and inventing one just to pay them leaves a profile nobody maintains.
  const res = await post('/cashbook/cash-out-linked', {
    amount: 500, date: '2026-08-01', remark: 'unloading labour',
    entityType: 'custom', entityId: '', entityName: 'Ramesh (labour)',
  });
  assert(res.status === 201, `expected 201, got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.entityName === 'Ramesh (labour)', `name lost: ${JSON.stringify(res.data)}`);
  assert(res.data.entityType === 'custom', `type lost: ${res.data.entityType}`);

  if (res.data.id) await del('/cashbook/' + res.data.id);
});

test('cashbook: a custom cash-out with no name is refused', async () => {
  // Cash leaving the book with nobody attached to it is the one outcome worse
  // than not recording it at all.
  const res = await post('/cashbook/cash-out-linked', {
    amount: 500, date: '2026-08-01', entityType: 'custom', entityId: '', entityName: '   ',
  });
  assert(res.status === 400, `expected 400, got ${res.status}`);
});

test('cashbook: a roster cash-out still needs a real entity id', async () => {
  // Relaxing the guard for `custom` must not relax it for drivers and staff,
  // whose entries create a linked advance against a profile id.
  const res = await post('/cashbook/cash-out-linked', {
    amount: 500, date: '2026-08-01', entityType: 'driver', entityId: '', entityName: 'Someone',
  });
  assert(res.status === 400, `expected 400, got ${res.status}`);
});

// Run
runAll();
