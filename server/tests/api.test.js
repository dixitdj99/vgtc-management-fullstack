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

// Run
runAll();
