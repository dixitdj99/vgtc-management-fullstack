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

// Also for the in-process requires below (archiveService, listBackupService),
// which reach Drive directly rather than through the spawned server.
process.env.VGTC_DISABLE_DRIVE = '1';
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
    env: {
      ...process.env,
      PORT: String(port),
      // The token above is signed with SECRET, so the server has to verify with it.
      JWT_SECRET: SECRET,
      // The voucher and LR routes back themselves up to Drive on create, so a
      // test run was filing invented records into the real customer folder.
      // Nothing asked for that — it came free with the hooks.
      VGTC_DISABLE_DRIVE: '1',
    },
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
function put(path, body) { return request('PUT', path, body); }
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

/* ── Splitting a multi-LR voucher for display ─────────────────────────────── */

test('a multi-LR voucher splits into one leg per LR, deductions on the first', async () => {
  // Each drop has its own destination, rate and LR number. The deductions are
  // for the whole trip and are not divisible by destination, so they sit on the
  // first leg rather than being invented per leg.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'BalanceSheet.jsx'), 'utf8');
  const start = src.indexOf('export function explodeVoucher');
  assert(start !== -1, 'explodeVoucher is not exported');
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  // eslint-disable-next-line no-new-func
  const explodeVoucher = new Function(
    `${src.slice(start, i + 1).replace('export function', 'function')}\nreturn explodeVoucher;`)();

  const voucher = {
    id: 'v1', lrNo: '', truckNo: 'HR47G9999', date: '2026-08-02',
    advanceDiesel: '4000', advanceCash: '1000', munshi: '100', paidBalance: '500',
    deliveries: [
      { lrNo: '101', destination: 'Rewari', weight: '6', rate: '420' },
      { lrNo: '102', destination: 'Sohna', weight: '4', rate: '500' },
    ],
  };
  const legs = explodeVoucher(voucher);
  assert(legs.length === 2, `expected 2 legs, got ${legs.length}`);

  // Each leg is identifiable by its own LR and priced on its own drop.
  assert(legs[0].lrNo === '101' && legs[1].lrNo === '102', `LRs: ${legs.map(l => l.lrNo)}`);
  assert(legs[0].destination === 'Rewari' && legs[1].destination === 'Sohna', 'destinations lost');
  assert(legs[0].rate === '420' && legs[1].rate === '500', 'per-drop rates lost');
  assert(!legs[0].deliveries && !legs[1].deliveries, 'a leg must price from its own weight x rate');

  // Deductions on the first only — never duplicated across legs.
  assert(legs[0].advanceDiesel === '4000' && legs[0].advanceCash === '1000', 'first leg lost the deductions');
  assert(legs[1].advanceDiesel === '' && legs[1].advanceCash === '', 'deductions were duplicated onto leg 2');
  assert(legs[1].paidBalance === '', 'payment belongs to the voucher, not to every leg');
  assert(legs[1]._noDeductions === true, 'leg 2 must suppress the automatic munshi');

  // Writes must address the voucher, not a leg.
  assert(legs[0].id === 'v1', 'the first leg is the voucher itself');
  assert(legs[1].id !== 'v1' && legs[1]._parentId === 'v1', 'a later leg needs its own key and a parent');

  // A plain voucher is untouched.
  const plain = explodeVoucher({ id: 'v2', lrNo: '9', weight: '25', rate: '700' });
  assert(plain.length === 1 && plain[0].id === 'v2', 'a single-LR voucher must pass through unchanged');
});

test('the automatic munshi is not charged again on every leg', async () => {
  // calcNet defaults munshi from the weight when none was entered, so a zeroed
  // leg would silently be charged Rs.50-100 of its own.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'BalanceSheet.jsx'), 'utf8');
  const m = src.match(/const munshi = [^\n]*/);
  assert(m, 'the munshi line was not found — has calcNet been rewritten?');
  assert(/_noDeductions/.test(m[0]),
    `calcNet no longer honours _noDeductions, so split legs each get their own munshi: ${m[0]}`);
});

/* ── Diesel verification ──────────────────────────────────────────────────── */

test('verifying a full tank replaces the estimate with what it actually cost', async () => {
  // "FULL" is treated as a Rs.4,000 estimate by every net calculation, so until
  // the real bill is recorded the balance sheet is wrong. Verification is when
  // that figure turns up.
  const made = await post('/vouchers', {
    lrNo: '99901', date: '2026-08-02', truckNo: 'HR47G9999', partyName: 'Test',
    weight: '25', rate: '700', advanceDiesel: 'FULL', isFullTank: true,
    pump: 'Sharma Filling Station', type: 'Dump', brand: 'dump',
  });
  const id = made.data.id;
  try {
    // The screens now send the amount alone — litres and the pump were being
    // retyped from what the voucher already held.
    await patch(`/vouchers/${id}/verify-diesel`, { dieselActualAmount: 5200 });
    const after = (await get('/vouchers')).data.find(v => v.id === id);
    assert(after.isDieselVerified === true, 'should be marked verified');
    assert(parseFloat(after.advanceDiesel) === 5200,
      `the estimate should have been replaced, got ${after.advanceDiesel}`);
    assert(after.dieselEstimatedAmount === 'FULL', 'what it replaced should be recorded');
  } finally { await del('/vouchers/' + id); }
});

test('verifying without litres or a pump leaves earlier ones intact', async () => {
  // The screens stopped sending these, and writing the defaults for absent
  // fields would have blanked what an earlier verification recorded.
  const made = await post('/vouchers', {
    lrNo: '99903', date: '2026-08-02', truckNo: 'HR47G9999', partyName: 'Test',
    weight: '25', rate: '700', advanceDiesel: '3000', type: 'Dump', brand: 'dump',
  });
  const id = made.data.id;
  try {
    await patch(`/vouchers/${id}/verify-diesel`, { dieselActualLitres: 40, dieselPumpName: 'Sharma' });
    await patch(`/vouchers/${id}/verify-diesel`, {});   // the new, amount-only shape

    const after = (await get('/vouchers')).data.find(v => v.id === id);
    assert(parseFloat(after.dieselActualLitres) === 40, `litres were wiped: ${after.dieselActualLitres}`);
    assert(after.dieselPumpName === 'Sharma', `pump was wiped: ${after.dieselPumpName}`);
    assert(after.isDieselVerified === true, 'it should still be verified');
  } finally { await del('/vouchers/' + id); }
});

test('verifying does not re-price a trip whose diesel was already a number', async () => {
  // Verification confirms a fill; it is not a place to change what was booked.
  const made = await post('/vouchers', {
    lrNo: '99902', date: '2026-08-02', truckNo: 'HR47G9999', partyName: 'Test',
    weight: '25', rate: '700', advanceDiesel: '3000', type: 'Dump', brand: 'dump',
  });
  const id = made.data.id;
  try {
    await patch(`/vouchers/${id}/verify-diesel`, {
      dieselActualLitres: 30, dieselPumpName: 'Sharma', dieselActualAmount: 9999,
    });
    const after = (await get('/vouchers')).data.find(v => v.id === id);
    assert(parseFloat(after.advanceDiesel) === 3000,
      `a booked amount must not be overwritten, got ${after.advanceDiesel}`);
    assert(after.isDieselVerified === true, 'it should still be marked verified');
  } finally { await del('/vouchers/' + id); }
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

test('archiving refuses what it should, before it ever reaches Drive', async () => {
  // VGTC_DISABLE_DRIVE is set at the top of this file, so a valid call here
  // reports "not connected" rather than uploading. An earlier version of this
  // test ran against a live token and left real files in the customer's folder.
  const archiveService = require('../utils/archiveService');
  const driveService = require('../utils/driveService');
  assert((await driveService.isAuthorized()) === false,
    'the suite must never write to the real Drive — VGTC_DISABLE_DRIVE is not taking effect');

  const noHtml = await archiveService.archive({ module: 'Vouchers', name: 'x', html: '' });
  assert(noHtml.archived === false, 'an empty document should not be filed');

  const noName = await archiveService.archive({ module: 'Vouchers', name: '', html: '<p>hi</p>' });
  assert(noName.archived === false, 'a nameless document should not be filed');

  const huge = await archiveService.archive({
    module: 'Vouchers', name: 'x', html: 'a'.repeat(archiveService.MAX_HTML_BYTES + 1),
  });
  assert(huge.archived === false && /too large/i.test(huge.reason), `oversized: ${JSON.stringify(huge)}`);
});

test('the archive endpoint answers 200 whether or not Drive is up', async () => {
  // Invalid on purpose, for the same reason as above: this asserts the contract
  // — never a 500, always an `archived` flag — without filing anything.
  const res = await post('/archive', { module: 'Vouchers', name: 'probe', html: '' });
  assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.archived === false, `expected archived:false, got ${JSON.stringify(res.data)}`);
  assert(typeof res.data.reason === 'string', 'a refusal should say why');

  const status = await get('/archive/status');
  assert(status.status === 200 && 'authorized' in status.data, 'status should report Drive connectivity');
});

test('weekly-lists is registered and covers every module folder', async () => {
  // Registration and coverage only — invoking it would run a full backup into
  // the org's real Drive.
  const { JOBS } = require('../jobs');
  assert(typeof JOBS['weekly-lists'] === 'function', 'weekly-lists must be in the JOBS registry');

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

/* ── Profit & Loss ────────────────────────────────────────────────────────── */

/**
 * pnl.js is deliberately import-free so it can be loaded here and asserted on
 * as arithmetic rather than as rendered markup. Money that is not counted does
 * not announce itself, which is the whole reason these tests exist.
 */
function loadPnl() {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'pnl.js'), 'utf8');
  assert(!/^import /m.test(src),
    'pnl.js has grown an import — the test can no longer load it, and neither can it stay dependency-free');
  // eslint-disable-next-line no-new-func
  return new Function(`${src.replace(/^export /gm, '')}
    return { buildPnlRecords, summarisePnl, perTruck, pnlCoverage, ownFleet,
             voucherGross, voucherDiesel, monthOf, PNL_GROUPS, FULL_TANK_ESTIMATE };`)();
}

const OWN = [{ id: 'veh1', truckNo: 'HR47G0975', ownershipType: 'self' }];
const sumOf = (records, category) =>
  records.filter(r => r.category === category).reduce((s, r) => s + r.amount, 0);

test('pnl: diesel is read off the field a voucher actually has', async () => {
  // The page used to read v.diesel, v.cash and v.online. A voucher stores
  // advanceDiesel, advanceCash and advanceOnline, so diesel always totalled
  // zero and nothing on screen said so.
  const { buildPnlRecords, FULL_TANK_ESTIMATE } = loadPnl();
  const records = buildPnlRecords({
    vehicles: OWN,
    vouchers: [
      { id: 'a', truckNo: 'HR47G0975', date: '2026-07-04', weight: '25', rate: '700', advanceDiesel: '4000', advanceCash: '1000', advanceOnline: '500' },
      { id: 'b', truckNo: 'HR47G0975', date: '2026-07-06', weight: '20', rate: '700', advanceDiesel: 'FULL' },
    ],
  });
  assert(sumOf(records, 'Diesel') === 4000 + FULL_TANK_ESTIMATE,
    `diesel should be 4000 + the full-tank estimate, got ${sumOf(records, 'Diesel')}`);
  assert(sumOf(records, 'Driver trip advances') === 1500,
    `cash and online advances lost: ${sumOf(records, 'Driver trip advances')}`);
});

test('pnl: a payment with no truck number still reaches the sheet', async () => {
  // Pump, tyre, workshop and labour payments were filtered by p.truckNo, a
  // field payment records have never carried, so every one was discarded.
  const { buildPnlRecords, summarisePnl } = loadPnl();
  const records = buildPnlRecords({
    vehicles: OWN,
    payments: [
      { id: 'p1', category: 'Salary', amount: '12000', date: '2026-07-05', profileName: 'RAVI KUMAR' },
      { id: 'p2', category: 'Other', amount: '3000', date: '2026-07-08', remark: 'office rent' },
      { id: 'p3', category: 'Pump', amount: '50000', date: '2026-07-09', profileName: 'S K FILLING STATION' },
    ],
  });
  assert(sumOf(records, 'Driver & staff salary') === 12000,
    `salary lost: ${sumOf(records, 'Driver & staff salary')}`);
  assert(sumOf(records, 'Office expenses') === 3000,
    `office rent lost: ${sumOf(records, 'Office expenses')}`);

  // The pump bill is the same money as the trip diesel, so it is reported but
  // never added to the total.
  const s = summarisePnl(records);
  assert(s.settlements === 50000, `pump settlement not reported: ${s.settlements}`);
  assert(s.expense === 15000, `a settlement was counted as an expense: ${s.expense}`);
});

test('pnl: a market truck earns a commission, not a trip margin', async () => {
  // The client's bill and the owner's payout are money passing through. Only
  // what the firm keeps is income — and none of the trip costs are the firm's.
  const { buildPnlRecords, summarisePnl } = loadPnl();
  const records = buildPnlRecords({
    vehicles: OWN,
    vouchers: [{
      id: 'm1', truckNo: 'HR63B8291', date: '2026-07-10',
      weight: '25', rate: '700', commission: '500', munshi: '100', shortage: '200',
      advanceDiesel: '4000', advanceCash: '2000',
    }],
  });
  const s = summarisePnl(records);
  assert(s.income === 800, `a market truck should yield 500+100+200, got ${s.income}`);
  assert(s.expense === 0, `market trip costs are the owner's, not the firm's: ${s.expense}`);
  assert(sumOf(records, 'Own-fleet freight') === 0, 'a hired truck must not book freight as income');
});

test('pnl: an own truck books its freight, priced per drop on a multi-LR trip', async () => {
  // A voucher with deliveries has no top-level weight or rate, so pricing from
  // those fields quietly earns the firm nothing on its own trucks.
  const { buildPnlRecords, summarisePnl } = loadPnl();
  const records = buildPnlRecords({
    vehicles: OWN,
    vouchers: [{
      id: 'v1', truckNo: 'HR47G0975', date: '2026-07-12',
      deliveries: [
        { lrNo: '1236', destination: 'Rewari', weight: '6', rate: '420' },
        { lrNo: '1237', destination: 'Sohna', weight: '4', rate: '500' },
      ],
    }],
  });
  const expected = 6 * 420 + 4 * 500;
  assert(sumOf(records, 'Own-fleet freight') === expected,
    `multi-LR freight should be ${expected}, got ${sumOf(records, 'Own-fleet freight')}`);
  assert(summarisePnl(records).income === expected, 'the drops did not reach the income total');
});

test('pnl: an EMI counts once its due date passes, ticked off or not', async () => {
  // EmiScheduleTracker treats an instalment as due on its date. The sheet
  // counted only status === 'paid', so a schedule nobody maintains cost nothing.
  const { buildPnlRecords } = loadPnl();
  const records = buildPnlRecords({
    today: '2026-07-20',
    vehicles: [{
      id: 'veh1', truckNo: 'HR47G0975', ownershipType: 'self',
      emiDetails: JSON.stringify({
        due: 45000, bankName: 'HDFC', tenure: 48, schedule: [
          { installmentNo: 1, dueDate: '2026-06-05', amount: 45000, status: 'pending' },
          { installmentNo: 2, dueDate: '2026-07-05', amount: 45000, status: 'paid', paymentDate: '2026-07-05' },
          { installmentNo: 3, dueDate: '2026-08-05', amount: 45000, status: 'pending' },
        ],
      }),
    }],
  });
  assert(sumOf(records, 'Vehicle loan EMI') === 90000,
    `two instalments have fallen due, expected 90000, got ${sumOf(records, 'Vehicle loan EMI')}`);
});

test('pnl: a loan with no schedule still costs money every month', async () => {
  const { buildPnlRecords } = loadPnl();
  const records = buildPnlRecords({
    today: '2026-07-20',
    vehicles: [{
      id: 'veh1', truckNo: 'HR47G0975', ownershipType: 'self',
      emiDetails: { due: 30000, tenure: 48, startDate: '2026-04-05', emiDay: 5 },
    }],
  });
  // The first instalment falls due a month after the start date, so by 20 July
  // three have passed: 5 May, 5 June, 5 July.
  assert(sumOf(records, 'Vehicle loan EMI') === 90000,
    `expected three instalments accrued, got ${sumOf(records, 'Vehicle loan EMI')}`);
  const months = records.filter(r => r.category === 'Vehicle loan EMI').map(r => r.month).sort();
  assert(months.join(',') === '2026-05,2026-06,2026-07',
    `an accrued EMI landed in the wrong month: ${months.join(',')}`);
});

test('pnl: a returned cash-out and its refund cancel rather than double', async () => {
  const { buildPnlRecords, summarisePnl } = loadPnl();
  const records = buildPnlRecords({
    vehicles: OWN,
    cashbook: [
      { id: 'c1', type: 'cash_out', amount: '5000', date: '2026-07-02', entityType: 'driver', entityName: 'RAVI', isReturned: true, returnEntryId: 'c2' },
      { id: 'c2', type: 'deposit', amount: '5000', date: '2026-07-03', isRefundEntry: true, originalEntryId: 'c1' },
      { id: 'c3', type: 'cash_out', amount: '2000', date: '2026-07-04', entityType: 'staff', entityName: 'SUNIL' },
    ],
  });
  const s = summarisePnl(records);
  assert(s.expense === 2000, `the returned advance was still counted: ${s.expense}`);
  assert(s.income === 0, `the refund was booked as income: ${s.income}`);
});

test('pnl: tolls, tyres and workshop bills all reach the sheet', async () => {
  // None of the three were counted anywhere before.
  const { buildPnlRecords } = loadPnl();
  const records = buildPnlRecords({
    vehicles: OWN,
    tolls: [{ id: 't1', truckNo: 'HR47G0975', date: '2026-07-11', amount: '850', route: 'KMP' }],
    tyres: [{ id: 'y1', purchaseDate: '2026-07-03', purchasePrice: '22000', serialNo: 'X1', fitment: { truckNo: 'HR47G0975' } }],
    maintenance: [{ id: 'm1', truckNo: 'HR47G0975', date: '2026-07-07', cost: '3000', labourCost: '500', partName: 'Clutch plate' }],
  });
  assert(sumOf(records, 'Tolls') === 850, `tolls: ${sumOf(records, 'Tolls')}`);
  assert(sumOf(records, 'Tyres') === 22000, `tyres: ${sumOf(records, 'Tyres')}`);
  assert(records.find(r => r.category === 'Tyres').truckNo === 'HR47G0975',
    'a fitted tyre belongs to the truck it is on');
  assert(sumOf(records, 'Maintenance') === 3500,
    `workshop cost must include labour: ${sumOf(records, 'Maintenance')}`);
});

test('pnl: a tyre on somebody else\'s truck is not the firm\'s cost', async () => {
  // Found against real data: every fitted tyre was charged to the firm, so a
  // tyre store's whole inventory landed on the sheet — Rs.2 crore of a fleet
  // the firm does not own, dwarfing every genuine line on the page.
  const { buildPnlRecords } = loadPnl();
  const records = buildPnlRecords({
    vehicles: OWN,
    tyres: [
      { id: 'y1', purchaseDate: '2026-07-03', purchasePrice: '18000', fitment: { truckNo: 'HR47G0975' } },
      { id: 'y2', purchaseDate: '2026-07-03', purchasePrice: '18000', fitment: { truckNo: 'HR63B8291' } },
      { id: 'y3', purchaseDate: '2026-07-03', purchasePrice: '18000', fitment: null },
    ],
  });
  // The own truck's tyre, and the one still in stock — not the market truck's.
  assert(sumOf(records, 'Tyres') === 36000,
    `expected the own truck's tyre and the stock only, got ${sumOf(records, 'Tyres')}`);
  assert(records.some(r => r.category === 'Tyres' && r.fleet === 'firm'),
    'unfitted stock is still the firm\'s money and must be counted');
});

test('pnl: a truck named for the firm before the flag existed is still own fleet', async () => {
  // Trip Profit and Mileage both accept this; the P&L used to demand
  // ownershipType === 'self' and quietly dropped the older trucks.
  const { ownFleet } = loadPnl();
  const fleet = ownFleet([
    { truckNo: 'HR47G0975', ownerName: 'VIKAS GOODS TRANSPORT' },
    { truckNo: 'HR63B8291', ownerName: 'Some Owner' },
  ]);
  assert(fleet.has('HR47G0975'), 'a firm-named truck was treated as a market truck');
  assert(!fleet.has('HR63B8291'), 'a market truck was treated as own fleet');
});

test('pnl: the statement adds up, and per-truck rows come out of the same records', async () => {
  const { buildPnlRecords, summarisePnl, perTruck } = loadPnl();
  const records = buildPnlRecords({
    today: '2026-07-31',
    vehicles: OWN,
    vouchers: [
      { id: 'v1', truckNo: 'HR47G0975', date: '2026-07-04', weight: '25', rate: '700', advanceDiesel: '4000', advanceCash: '1000' },
      { id: 'v2', truckNo: 'HR63B8291', date: '2026-07-05', weight: '25', rate: '700', commission: '500' },
    ],
    payments: [{ id: 'p1', category: 'Salary', amount: '12000', date: '2026-07-05', profileName: 'RAVI' }],
    tolls: [{ id: 't1', truckNo: 'HR47G0975', date: '2026-07-06', amount: '850' }],
  });
  const s = summarisePnl(records);

  const income = 25 * 700 + 500 + 100;         // freight + commission + munshi on the market truck
  const expense = 4000 + 1000 + 12000 + 850;
  assert(s.income === income, `income: expected ${income}, got ${s.income}`);
  assert(s.expense === expense, `expense: expected ${expense}, got ${s.expense}`);
  assert(s.net === income - expense, `net does not match its own parts: ${s.net}`);

  // Every group total must be accounted for by the two headline figures,
  // otherwise a category exists that the statement never displays.
  const grouped = s.groups.reduce((t, g) => t + g.total, 0);
  assert(grouped === s.income + s.expense,
    `a group is missing from the statement: groups ${grouped} vs ${s.income + s.expense}`);

  const rows = perTruck(records);
  assert(rows.length === 1, `only the own truck gets a profit row, got ${rows.length}`);
  assert(rows[0].truckNo === 'HR47G0975', `wrong truck: ${rows[0].truckNo}`);
  // Firm-wide salary is not split across trucks, so the row is freight less
  // the costs that name this truck.
  assert(rows[0].net === 25 * 700 - 4000 - 1000 - 850,
    `per-truck net: ${rows[0].net}`);
});

test('pnl: the sheet says what it could not see', async () => {
  // A page that reports zero because a collection failed to load is worse than
  // one that admits it.
  const { buildPnlRecords, pnlCoverage } = loadPnl();
  const data = {
    vehicles: OWN,
    vouchers: [
      { id: 'v1', truckNo: 'HR47G0975', date: '2026-07-04', weight: '25', rate: '' },
      { id: 'v2', truckNo: 'HR47G0975', date: '2026-07-06', weight: '25', rate: '700', advanceDiesel: 'FULL' },
    ],
    loadFailures: ['Tolls'],
  };
  const notes = pnlCoverage(data, buildPnlRecords(data)).join(' | ');
  assert(/no rate/i.test(notes), `an unpriced trip is not flagged: ${notes}`);
  assert(/full-tank/i.test(notes), `the diesel estimate is not flagged: ${notes}`);
  assert(/Tolls did not load/i.test(notes), `a failed collection is not flagged: ${notes}`);
});

/* ── Labour account ───────────────────────────────────────────────────────── */

const RATES = {
  groups: {
    dump: { default: { godown_load: 2, crossing_load: 3, godown_unload: 1.5 }, materials: { OPC: { godown_load: 4 } } },
    jharli: { default: { godown_load: 5, crossing_load: 6, godown_unload: 4 }, materials: {} },
  },
};

test('labour: a Direct load earns nothing, and the other two earn their own rate', async () => {
  // The point of the whole change. Without Direct, a load that never touched
  // the godown had to be filed as From Godown or Crossing, and labour who
  // never lifted it got paid for it.
  const svc = require('../utils/labourAccountService');
  const r = (material, activity) => svc.rateFor(RATES, 'dump', material, activity);

  assert(svc.LOADING_ACTIVITY['From Godown'] === 'godown_load', 'From Godown must price as a godown load');
  assert(svc.LOADING_ACTIVITY['Crossing'] === 'crossing_load', 'Crossing has its own rate');
  assert(svc.LOADING_ACTIVITY['Direct'] === null, 'a Direct load must earn nothing');
  assert(svc.LOADING_ACTIVITY['Godown'] === 'godown_load',
    'rows saved under the old label must still price, or the history silently drops to zero');

  assert(r('PPC', 'godown_load') === 2 && r('PPC', 'crossing_load') === 3,
    'the two loading rates must differ — that is why they are separate keys');
});

test('labour: at MIGO only a godown unload is charged', async () => {
  // Deliberately different from the loading side: a crossing at the gate is
  // bags moved between trucks, a crossing arriving is a truck passing through.
  const svc = require('../utils/labourAccountService');
  assert(svc.UNLOADING_ACTIVITY['Godown Unload'] === 'godown_unload', 'a godown unload must be paid');
  assert(svc.UNLOADING_ACTIVITY['Crossing'] === null, 'a crossing on the way in earns nothing');
  assert(svc.UNLOADING_ACTIVITY['Direct'] === null, 'a direct delivery earns nothing');
});

test('labour: a priced material beats the default, and one without falls back', async () => {
  // Rates arrive material by material. Without the fallback the account would
  // read zero for every material nobody had got round to pricing.
  const svc = require('../utils/labourAccountService');
  assert(svc.rateFor(RATES, 'dump', 'OPC', 'godown_load') === 4, 'a material with its own rate must use it');
  assert(svc.rateFor(RATES, 'dump', 'PPC', 'godown_load') === 2, 'a material without one must fall back to the default');
  assert(svc.rateFor(RATES, 'dump', 'OPC', 'crossing_load') === 3,
    'a material priced for one activity must still fall back for the others');
  assert(svc.rateFor(RATES, 'jharli', 'OPC', 'godown_load') === 5,
    'the two crews are priced independently');
  assert(svc.rateFor(RATES, 'dump', 'PPC', null) === 0, 'an unpaid activity has no rate at all');
});

test('labour: an empty box means "use the default", not "work for free"', async () => {
  // Storing 0 for a blank override would override the group default with free
  // labour — the one mistake that silently pays nobody.
  const svc = require('../utils/labourAccountService');
  const cleaned = svc.sanitiseRates({
    groups: { dump: { default: { godown_load: 7 }, materials: { PPC: { godown_load: '', crossing_load: '9' } } } },
  });
  assert(cleaned.groups.dump.materials.PPC.godown_load === undefined,
    'a blank override must not be stored');
  assert(cleaned.groups.dump.materials.PPC.crossing_load === 9, 'a filled override must survive');
  assert(svc.rateFor(cleaned, 'dump', 'PPC', 'godown_load') === 7, 'the blank must fall back to the default');
});

test('labour: the three dumps share a crew and Jharli has its own', async () => {
  const svc = require('../utils/labourAccountService');
  const groupOf = (key) => svc.PLANTS.find(p => p.key === key)?.group;
  assert(groupOf('kosli') === 'dump' && groupOf('jhajjar') === 'dump' && groupOf('bahadurgarh') === 'dump',
    'Kosli, Jhajjar and Bahadurgarh are worked by the same labour');
  assert(groupOf('jkl') === 'jharli', 'JK Lakshmi is Jharli labour');
  assert(groupOf('main') === 'jharli', 'the legacy JK Super book belongs with Jharli');
  // Every plant must name collections that exist, or its receipts vanish.
  assert(svc.PLANTS.every(p => p.lr && p.migo), 'a plant with no collections would be read as empty');
});

test('labour: earned minus paid is what is still owed, per crew', async () => {
  const svc = require('../utils/labourAccountService');
  const lines = [
    { group: 'dump', activity: 'godown_load', material: 'PPC', bags: 100, rate: 2, amount: 200, plantLabel: 'Kosli' },
    { group: 'dump', activity: 'crossing_load', material: 'OPC', bags: 50, rate: 3, amount: 150, plantLabel: 'Jhajjar' },
    { group: 'dump', activity: null, material: 'PPC', bags: 400, rate: 0, amount: 0, plantLabel: 'Kosli' }, // Direct
    { group: 'jharli', activity: 'godown_unload', material: 'PPC', bags: 20, rate: 4, amount: 80, plantLabel: 'JK Lakshmi' },
  ];
  const s = svc.summarise(lines, [{ group: 'dump', amount: 120 }]);
  const dump = s.groups.find(g => g.key === 'dump');
  const jharli = s.groups.find(g => g.key === 'jharli');

  assert(dump.earned === 350, `dump earned: expected 350, got ${dump.earned}`);
  assert(dump.bags === 150, `the 400 Direct bags must not be charged: ${dump.bags}`);
  assert(dump.paid === 120 && dump.balance === 230, `dump balance: ${dump.balance}`);
  assert(jharli.earned === 80 && jharli.balance === 80, `jharli: ${jharli.earned}/${jharli.balance}`);
  assert(s.totals.balance === 310, `firm-wide balance: ${s.totals.balance}`);
  // A plant's work must show under the plant it was done at.
  assert(dump.byPlant.Kosli.bags === 100, `Direct bags leaked into the plant breakdown: ${JSON.stringify(dump.byPlant)}`);
});

test('labour: bags moved at no rate are counted and flagged, not hidden', async () => {
  // A rate nobody has entered yet must be visible as unpriced work rather than
  // read as a day where nothing happened.
  const svc = require('../utils/labourAccountService');
  const s = svc.summarise([
    { group: 'dump', activity: 'godown_load', material: 'NEW MAT', bags: 90, rate: 0, amount: 0, plantLabel: 'Kosli' },
  ], []);
  const dump = s.groups.find(g => g.key === 'dump');
  assert(dump.unpricedBags === 90, `unpriced bags not flagged: ${dump.unpricedBags}`);
  assert(dump.earned === 0, 'unpriced work cannot invent a figure');
});

test('labour: a MIGO entry keeps its unloading type, defaulting to a godown unload', async () => {
  // addStock destructures its payload field by field, so a new field is
  // dropped in silence unless it is named there.
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'utils', 'stockService.js'), 'utf8');
  const body = src.slice(src.indexOf('addStock:'), src.indexOf('getOverview:'));
  assert(/unloadingType/.test(body), 'addStock drops unloadingType — the labour account would see every MIGO as a godown unload');
  assert(/'Godown Unload'/.test(body), 'the default must be a godown unload, which is what MIGO always meant before');
});

test('labour: the account is reachable with pay permission and nothing else', async () => {
  // It reads ten collections gated on lr_* and stock_*. Doing that from the
  // browser would hand a clerk who has Pay a fistful of 403s.
  const res = await get('/labour-account/meta');
  assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.groups.length === 2, `expected two crews, got ${res.data.groups.length}`);
  assert(res.data.plants.length === 5, `every plant must be covered, got ${res.data.plants.length}`);
  assert(res.data.loadingTypes.Direct === null, 'the client must be told Direct earns nothing');
});

test('labour: each crew is priced on its own stock module\'s materials', async () => {
  // The rate grid used to show one list for both crews, built only from what
  // had already been loaded — so a material sitting in stock could not be
  // priced until the first load had gone out unpriced, and the dumps' materials
  // turned up on Jharli's sheet.
  const svc = require('../utils/labourAccountService');
  const res = await get('/labour-account/meta');
  const { dump, jharli } = res.data.materials;

  assert(Array.isArray(dump) && dump.length, 'the dump crew must have materials to price');
  assert(Array.isArray(jharli) && jharli.length, 'the Jharli crew must have materials to price');
  assert(svc.JKL_MATERIALS.every(m => jharli.includes(m)),
    `Jharli must carry its own materials: ${jharli.join(', ')}`);
  // Jharli's list is the one the firm confirmed correct; the legacy JK Super
  // book must not fold the dumps' materials into it.
  assert(!jharli.includes('Adstar') || dump.includes('Adstar'),
    'a dump material leaked onto the Jharli sheet');
  assert(svc.PLANTS.find(p => p.key === 'main').materials === null,
    'the legacy book must not define a crew\'s material palette');
});

test('labour: the summary prices real receipts and balances against payments', async () => {
  const rates = await put('/labour-account/rates', RATES);
  assert(rates.status === 200, `saving rates failed: ${rates.status} ${JSON.stringify(rates.data)}`);
  assert(rates.data.groups.dump.materials.OPC.godown_load === 4, 'the material override did not survive the round trip');

  const before = await get('/labour-account/summary');
  assert(before.status === 200, `summary failed: ${before.status}`);
  const dumpBefore = before.data.groups.find(g => g.key === 'dump');

  const pay = await post('/labour-account/payments', { group: 'dump', amount: 500, date: '2026-08-03', mode: 'Cash', remark: 'test' });
  assert(pay.status === 201, `payment failed: ${pay.status} ${JSON.stringify(pay.data)}`);

  const after = await get('/labour-account/summary');
  const dumpAfter = after.data.groups.find(g => g.key === 'dump');
  assert(dumpAfter.paid === dumpBefore.paid + 500, `paid did not move: ${dumpBefore.paid} → ${dumpAfter.paid}`);
  assert(dumpAfter.balance === dumpBefore.balance - 500, `balance did not fall by the payment: ${dumpAfter.balance}`);

  if (pay.data.id) await del('/labour-account/payments/' + pay.data.id);
});

test('labour: a payment needs a real crew and a positive amount', async () => {
  const bad = await post('/labour-account/payments', { group: 'nobody', amount: 100 });
  assert(bad.status === 400, `an unknown crew must be refused, got ${bad.status}`);
  const zero = await post('/labour-account/payments', { group: 'dump', amount: 0 });
  assert(zero.status === 400, `a zero payment must be refused, got ${zero.status}`);
});

/* ── Paying a whole owner from the settlement panel ───────────────────────── */

/** freightAllocation.js is pure and import-free — the code that moves money. */
function loadAllocation() {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'utils', 'freightAllocation.js'), 'utf8');
  assert(!/^import /m.test(src), 'freightAllocation.js grew an import and can no longer be loaded here');
  // eslint-disable-next-line no-new-func
  return new Function(`${src.replace(/^export /gm, '')}
    return { allocateFreightPayment, allocateAcrossTrucks, outstandingOf };`)();
}

const netFlat = () => (v) => parseFloat(v.net) || 0;

test('pay: settling a whole owner pays every truck it covers', async () => {
  // "Pay All" used to open a dialog of its own that could only pay in full.
  // It now drives the same settlement panel, so this is the arithmetic behind
  // that button.
  const { allocateAcrossTrucks } = loadAllocation();
  const trips = [
    { id: 'a1', truckNo: 'HR47G0975', date: '2026-07-01', net: 5000 },
    { id: 'a2', truckNo: 'HR47G0975', date: '2026-07-09', net: 3000 },
    { id: 'b1', truckNo: 'HR63B8291', date: '2026-07-04', net: 2000 },
  ];
  const res = allocateAcrossTrucks(trips, {
    amount: 10000, paymentDate: '2026-08-03', paymentMethod: 'Cash',
    trucks: ['HR47G0975', 'HR63B8291'], netOfTruck: netFlat,
  });
  assert(res.patches.length === 3, `every trip must be settled, got ${res.patches.length}`);
  assert(res.allocated === 10000 && res.unallocated === 0, `allocated ${res.allocated}, left ${res.unallocated}`);
  assert(res.patches.every(p => p.paymentClearedDate),
    'a trip paid in full must be marked cleared, or it stays open on the balance sheet');
});

test('pay: a part payment across an owner does not leave every truck half paid', async () => {
  // Pooling an owner's trips would let one truck's arrears swallow money meant
  // for another, and leave a scatter of part-paid trips behind.
  const { allocateAcrossTrucks } = loadAllocation();
  const trips = [
    { id: 'a1', truckNo: 'HR47G0975', date: '2026-07-01', net: 5000 },
    { id: 'a2', truckNo: 'HR47G0975', date: '2026-07-09', net: 3000 },
    { id: 'b1', truckNo: 'HR63B8291', date: '2026-07-04', net: 2000 },
  ];
  const res = allocateAcrossTrucks(trips, {
    amount: 6000, paymentDate: '2026-08-03', paymentMethod: 'Cash',
    trucks: ['HR47G0975', 'HR63B8291'], netOfTruck: netFlat,
  });
  const by = Object.fromEntries(res.patches.map(p => [p.id, p]));
  assert(res.allocated === 6000, `the whole payment must land somewhere: ${res.allocated}`);
  // The first truck's oldest trip clears, the next takes the remainder, and the
  // second truck is untouched — not every trip nibbled.
  assert(by.a1 && by.a1.paymentClearedDate, 'the oldest trip must clear first');
  assert(by.a2 && !by.a2.paymentClearedDate, 'a part-paid trip must not be marked cleared');
  assert(!by.b1, 'money must not spill onto the next truck while the first is still owed');
  assert(parseFloat(by.a2.paidBalance) === 1000, `remainder misallocated: ${by.a2.paidBalance}`);
});

test('pay: an overpayment across an owner is reported, never silently kept', async () => {
  const { allocateAcrossTrucks } = loadAllocation();
  const res = allocateAcrossTrucks(
    [{ id: 'a1', truckNo: 'HR47G0975', date: '2026-07-01', net: 1000 }],
    { amount: 2500, paymentDate: '2026-08-03', paymentMethod: 'Cash', trucks: ['HR47G0975'], netOfTruck: netFlat });
  assert(res.allocated === 1000, `only what is owed can be allocated: ${res.allocated}`);
  assert(res.unallocated === 1500, `the overpayment must be handed back: ${res.unallocated}`);
});

test('pay: a truck already paid off takes none of the money', async () => {
  const { allocateAcrossTrucks } = loadAllocation();
  const res = allocateAcrossTrucks([
    { id: 'a1', truckNo: 'HR47G0975', date: '2026-07-01', net: 4000, paidBalance: '4000' },
    { id: 'b1', truckNo: 'HR63B8291', date: '2026-07-04', net: 2000 },
  ], { amount: 2000, paymentDate: '2026-08-03', paymentMethod: 'Cash',
    trucks: ['HR47G0975', 'HR63B8291'], netOfTruck: netFlat });
  assert(res.patches.length === 1 && res.patches[0].id === 'b1',
    `a settled truck must be skipped: ${JSON.stringify(res.patches)}`);
  assert(res.unallocated === 0, `nothing should be left over: ${res.unallocated}`);
});

test('pay: Pay All keeps every LR in the group ticked, including late arrivals', async () => {
  // The reported bug: Pay All ticked one LR and left the rest of the owner's
  // trips out of the payment. The tick fired once on whatever rows existed at
  // that instant, and the rows arrive in stages — so anything that turned up
  // afterwards, or was revealed by clearing the date filter, was silently
  // excluded from the money being paid.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'PayModule.jsx'), 'utf8');
  const start = src.indexOf('export function ownerSelection');
  assert(start !== -1, 'ownerSelection is not exported from PayModule');
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  // eslint-disable-next-line no-new-func
  const ownerSelection = new Function(
    `${src.slice(start, i + 1).replace('export function', 'function')}\nreturn ownerSelection;`)();

  const first = [{ id: 'a1' }];
  const all = [{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }, { id: 'b2' }];

  assert(ownerSelection(first, new Set()).length === 1, 'the rows present at first are ticked');
  // The rest of the owner's trips land a moment later — every one must be ticked.
  assert(ownerSelection(all, new Set()).join(',') === 'a1,a2,b1,b2',
    `late-arriving trips were left out: ${ownerSelection(all, new Set()).join(',')}`);

  // Unticking one holds it back, and only it — even as more rows appear.
  const held = new Set(['b1']);
  assert(ownerSelection(all, held).join(',') === 'a1,a2,b2',
    `unticking did not hold back exactly one trip: ${ownerSelection(all, held).join(',')}`);
  assert(ownerSelection([...all, { id: 'c1' }], held).includes('c1'),
    'a trip appearing after the clerk unticked another must still be ticked');
  assert(!ownerSelection([...all, { id: 'c1' }], held).includes('b1'),
    'a held-back trip must stay held back');
});

test('pay: a truck typed with spaces still finds its owner', async () => {
  // Found while chasing a Pay All that "missed" a truck. Every vehicle lookup
  // in Pay was an exact string match, while the rest of the app normalises. A
  // truck registered HR55EF9012 but written HR55 EF 9012 on the voucher found
  // no vehicle — losing its owner, so it fell out of that owner's group and
  // Pay All skipped it, and losing the market-vehicle rule in calcNet, which
  // is money.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'PayModule.jsx'), 'utf8');

  const start = src.indexOf('export const normTruck');
  assert(start !== -1, 'normTruck is not exported from PayModule');
  // eslint-disable-next-line no-new-func
  const normTruck = new Function(
    `${src.slice(start, src.indexOf('\n', start)).replace('export const', 'const')}\nreturn normTruck;`)();

  assert(normTruck('HR55 EF 9012') === normTruck('HR55EF9012'), 'spacing must not split a truck');
  assert(normTruck('hr47g9999') === normTruck('HR47G9999'), 'case must not split a truck');
  assert(normTruck(undefined) === '', 'a missing truck number must not throw');

  // And no exact-match lookup may be left behind to reintroduce it.
  assert(!/find\(vh => vh\.truckNo === /.test(src),
    'an exact-match vehicle lookup is still there — it will drop trucks out of their owner’s group');
  assert(!/vehiclesInfo\.find\(v => v\.truckNo === /.test(src),
    'an exact-match vehicle lookup is still there — it will drop trucks out of their owner’s group');
});

test('pay: the owner popup is gone and Pay All opens the settlement panel', async () => {
  // Two ways to pay meant the lesser one silently lacked the tick boxes, the
  // part-payment box and the per-trip totals.
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'PayModule.jsx'), 'utf8');
  assert(!/payWholeOwner|payOwnerDone/.test(src), 'the separate owner-payment dialog is still there');
  assert(/setSelOwner\(g\.owner\)/.test(src), 'Pay All no longer opens the settlement panel');
  assert(/singleTruckMode/.test(src),
    'per-truck deductions must be gated, or an owner payment would apply one truck’s GPS rent to all of them');
});

/* ── Attendance: chasing the days nobody marked ───────────────────────────── */

const pub = (name) => require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'client', 'public', name), 'utf8');

/** Fetches a non-API path — BASE points at /api, which these are not under. */
function getPage(pathname) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE.replace(/\/api\/?$/, '') + pathname);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
    req.on('error', reject);
    req.end();
  });
}

/** Posts a URL-encoded body, the way a browser submits a form with no JS. */
function postForm(pathname, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE.replace(/\/api\/?$/, '') + pathname);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        ...extraHeaders,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({
        status: res.statusCode, body: data, type: res.headers['content-type'] || '',
      }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const distBuilt = () => require('fs').existsSync(
  require('path').join(__dirname, '..', '..', 'client', 'dist', 'home.html'));

test('attendance: a day drops off the pending list once everyone is marked', async () => {
  // The whole point of surfacing this. A day that stays after it has been done
  // is noise the admin learns to ignore, which defeats it.
  const svc = require('../services/attendanceService');
  const res = await get('/attendance/pending?days=14');
  assert(res.status === 200, `expected 200, got ${res.status} ${JSON.stringify(res.data)}`);
  assert(Array.isArray(res.data.days), 'pending days must be a list');
  assert(typeof res.data.totalPending === 'number', 'the card needs a total to show');

  const dates = res.data.days.map(d => d.date);
  assert(dates.join() === [...dates].sort().reverse().join(),
    `days must be newest first, got ${dates.join(', ')}`);

  for (const d of res.data.days) {
    assert(d.pending > 0, `${d.date} is on the list with nothing pending`);
    assert(d.pending <= d.total, `${d.date} claims ${d.pending} pending of ${d.total}`);
    assert(Array.isArray(d.names), `${d.date} carries no names to recognise it by`);
  }

  // Honours the business timezone, not UTC — between midnight and 05:30 IST a
  // UTC "today" is still yesterday.
  const today = svc.businessToday();
  assert(dates.every(d => d <= today), `a future day is on the list: ${dates.join(', ')}`);
  assert(res.data.days.length <= 14, `asked for 14 days, got ${res.data.days.length}`);
});

test('attendance: the pending window is capped however large a number is asked for', async () => {
  const res = await get('/attendance/pending?days=9999');
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(res.data.days.length <= 60, `the window was not capped: ${res.data.days.length} days`);
});

test('attendance: pending days need attendance permission', async () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'routes', 'attendanceRoutes.js'), 'utf8');
  const gate = src.indexOf("requirePermission('attendance', 'view')");
  const route = src.indexOf("router.get('/pending'");
  assert(gate !== -1 && gate < route, 'the pending route sits outside the attendance permission gate');
});

test('attendance: the dashboard marks today in place, and only today', async () => {
  const fs2 = require('fs');
  const path2 = require('path');
  const dash = fs2.readFileSync(
    path2.join(__dirname, '..', '..', 'client', 'src', 'modules', 'DashboardHome.jsx'), 'utf8');

  assert(/attendance\/bulk/.test(dash), 'the dashboard cannot save attendance');
  assert(!/attendance\/pending/.test(dash),
    'the dashboard still lists earlier days — those belong in the Attendance module');

  const card = dash.slice(dash.indexOf('function TodayRollCall'), dash.indexOf('export default'));
  assert(!/navTo\(/.test(card), 'the roll-call card navigates away instead of marking in place');
  assert(/const mark = async/.test(card), 'the card no longer saves on tap');
  assert(!/Save attendance/.test(card), 'a Save button is back on the card');
  assert(/records: \[\{/.test(card), 'the card writes more than the person just tapped');

  const hook = fs2.readFileSync(
    path2.join(__dirname, '..', '..', 'client', 'src', 'hooks', 'useDashboardData.js'), 'utf8');
  assert(/attendance\/roster/.test(hook), "the dashboard does not load today's roll-call");
  assert(/role === 'admin'/.test(hook), 'the roll-call is fetched for non-admins too');
});

test('attendance: the module saves as you mark, without losing a mark in flight', async () => {
  // No Save button there either. The tile cycles through statuses, so the write
  // is debounced — and a debounce is exactly where marks go missing.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AttendanceModule.jsx'), 'utf8');

  assert(!/handleSave/.test(src), 'the Save button handler is still there');
  assert(/scheduleAutoSave/.test(src), 'marks are not auto-saved');
  assert(/beforeunload/.test(src), 'closing the tab would drop a mark still on the timer');
  assert(/useEffect\(\(\) => \(\) => \{[\s\S]{0,140}persist\(\)/.test(src),
    'leaving the screen would drop a mark still on the timer');

  const changeDate = src.slice(src.indexOf('const changeDate'), src.indexOf('const shiftDate'));
  assert(/await persist\(\)/.test(changeDate),
    'stepping to another date would write the mark against the wrong day');

  assert(/e0\[r\.profileId\] !== r\.status/.test(src),
    'every auto-save rewrites the whole roll-call');
});

test('attendance: the module lists the earlier days, today excluded', async () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AttendanceModule.jsx'), 'utf8');
  assert(/attendance\/pending/.test(src), 'the module does not show the days that were missed');
  assert(/filter\(d => !d\.isToday\)/.test(src),
    "today appears in the module's missed-days list — it is the dashboard's job and is not missed yet");
  assert(/loadPendingDays\(\);/.test(src.slice(src.indexOf('attendance/bulk'))),
    'the missed-days list is not refreshed after saving, so a finished day keeps asking');
});

/* ── The public landing page ──────────────────────────────────────────────── */

test('landing: the app keeps the root and the landing page sits at /home', async () => {
  // The application owns the apex — every bookmark, the PWA and every clerk
  // still land on the login screen at vgtc.site. The one public page has its
  // own address instead.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'index.js'), 'utf8');

  const homeRoute = src.indexOf("app.get('/home'");
  const staticLine = src.indexOf('express.static(path.join(__dirname');
  assert(homeRoute !== -1, 'nothing serves the landing page at /home');
  assert(homeRoute < staticLine, 'express.static would answer /home first');
  // The root has an OAuth callback on it that falls through with next(), which
  // is fine. What must never happen is the landing page being served there.
  assert(!/app\.get\('\/',[\s\S]{0,400}home\.html/.test(src),
    'the landing page is being served at the root — that belongs to the app');

  if (!distBuilt()) return;   // nothing to serve until the client is built

  const home = await getPage('/home');
  assert(home.status === 200, `GET /home returned ${home.status}`);
  assert(/Vikas Goods Transport/.test(home.body), '/home is not the landing page');
  assert(!/<div id="root">/.test(home.body), '/home is serving the app shell');

  for (const route of ['/', '/admin/login', '/labour', '/loading-status']) {
    const res = await getPage(route);
    assert(res.status === 200, `GET ${route} returned ${res.status}`);
    assert(/<div id="root">/.test(res.body), `GET ${route} no longer serves the app`);
  }
});

test('landing: the root, the manifest and the sitemap all still point at the app', async () => {
  const manifest = JSON.parse(pub('manifest.json'));
  assert(manifest.start_url === '/',
    `start_url is ${manifest.start_url} — an installed app must open the app, not marketing copy`);
  assert(manifest.scope === '/', 'scope must stay / or the installed app cannot reach /admin or /labour');
  assert(JSON.parse(pub('manifest-labour.json')).start_url === '/labour',
    'the labour portal must keep its own start_url');

  assert(pub('sitemap.xml').includes('https://vgtc.site/home'),
    'the sitemap points at the root, which is the login screen');
  assert(pub('robots.txt').includes('Allow: /home'), 'the one public page is not allowed');
});

test('landing: the page carries what Google needs to rank it', async () => {
  const html = pub('home.html');
  assert(/<title>[^<]{25,}<\/title>/.test(html), 'no usable title');
  assert(/<meta name="description" content="[^"]{80,}"/.test(html), 'no usable meta description');
  assert(/rel="canonical" href="https:\/\/vgtc\.site\/home"/.test(html),
    'no canonical — /home.html would compete with /home as duplicate content');
  assert(/application\/ld\+json/.test(html), 'no structured data, which is what feeds local results');
  assert(/"@type": "MovingCompany"/.test(html), 'the business is not typed for search');
  assert(/og:title/.test(html) && /og:description/.test(html), 'no Open Graph tags for shares');

  // Speed is a ranking factor, and this is read at a loading gate on a weak
  // signal. Nothing may block the render.
  assert(!/<script(?![^>]*application\/ld\+json)/.test(html), 'the page pulled in JavaScript');
  assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), 'a render-blocking web font crept in');
});

test('landing: only true, checkable claims are on the page', async () => {
  // Everything here is corroborated by server/config/plantConfig.js. An
  // unverifiable claim on a public page can cost the business its listing.
  const html = pub('home.html');
  const cfg = require('../config/plantConfig');
  const info = cfg.VGTC_INFO || Object.values(cfg).find(v => v && v.gstin);

  assert(html.includes(info.gstin), `the GSTIN does not match config (${info.gstin})`);
  assert(html.includes(info.email), 'the email does not match config');
  assert(/Rewari/.test(html), 'the office town is missing, which is what local search matches on');
  for (const office of ['Jharli', 'Jhajjar']) {
    assert(html.includes(office), `the ${office} office is missing`);
  }
  for (const godown of ['Kosli', 'Bahadurgarh']) {
    assert(html.includes(godown), `godown ${godown} is missing`);
  }
  assert(/[Bb]ilty/.test(html), 'the bilty-per-trip promise is missing');
  assert(/[Dd]iesel advance/.test(html), 'the payment terms are missing');
  assert(!/years of experience|trusted by|[0-9]+\+? trucks|testimonial/i.test(html),
    'an unverifiable claim is on the page');

  // The number is deliberately not printed — enquiries come through the form so
  // every lead is written down. It stays in the structured data, which is what
  // lets Google offer a call button in a local result.
  const visible = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  assert(!visible.includes(info.contact),
    'the phone number is printed on the page — it was meant to be reachable only through the form');
  assert(html.includes(info.contact), 'the phone is missing from the structured data too');
  assert(!/href="tel:/.test(visible), 'a click-to-call link is still on the page');
});

test('landing: the form is not blocked by the server that served the page', async () => {
  // A browser attaches an Origin header to a form submission even when it is
  // same-origin, so the enquiry form's POST went through the CORS check and was
  // refused — the server rejecting a request from a page it had just served.
  const url = new URL(BASE.replace(/\/api\/?$/, ''));
  const res = await postForm('/api/enquiry', 'kind=vehicle&name=Origin+Test&phone=9876500000',
    { Origin: `http://${url.hostname}:${url.port}` });
  assert(res.status === 201, `the page's own origin was refused: ${res.status}`);

  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.js'), 'utf8');
  assert(/isSameOrigin\(origin, req\) \|\| isAllowedOrigin\(origin\)/.test(src),
    'the origin check no longer runs the allowlist for other hosts');
});

test('landing: the enquiry form records a vehicle owner and answers with a page', async () => {
  const body = 'kind=vehicle&name=Test+Owner&phone=9876543210&vehicleNo=HR47G1111'
    + '&vehicleType=10-wheeler&capacity=25&city=Rewari&message=Testing';
  const res = await postForm('/api/enquiry', body);
  assert(res.status === 201, `expected 201, got ${res.status}`);
  assert(/text\/html/.test(res.type), `reply must be a page, got ${res.type}`);
  assert(/Thank you/i.test(res.body), 'no thank-you shown to the person who filled it in');
});

test('landing: an enquiry without a usable phone number is refused', async () => {
  // A lead with no way to call it back is worse than no lead — it looks handled.
  const noPhone = await postForm('/api/enquiry', 'kind=vehicle&name=Test+Owner&phone=');
  assert(noPhone.status === 400, `a missing number must be refused, got ${noPhone.status}`);
  const shortPhone = await postForm('/api/enquiry', 'kind=vehicle&name=Test+Owner&phone=12345');
  assert(shortPhone.status === 400, `a five-digit number must be refused, got ${shortPhone.status}`);
  const noName = await postForm('/api/enquiry', 'kind=vehicle&name=&phone=9876543210');
  assert(noName.status === 400, `a missing name must be refused, got ${noName.status}`);
});

test('landing: the honeypot swallows a bot without telling it anything', async () => {
  const res = await postForm('/api/enquiry',
    'name=Bot&phone=9876543210&website=http%3A%2F%2Fspam.example');
  assert(res.status === 200, `a bot should get a bland 200, got ${res.status}`);
  assert(/Thank you/i.test(res.body), 'the bot must not learn it was caught');
});

test('landing: enquiries are not readable without logging in', async () => {
  // Names and phone numbers of everyone who filled the form. The router is
  // mounted unauthenticated so the form can post to it, so the read side has
  // to guard itself.
  const url = new URL(BASE.replace(/\/api\/?$/, '') + '/api/enquiry/list');
  const open = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET' },
      (r) => { let d = ''; r.on('data', c => (d += c)); r.on('end', () => resolve({ status: r.statusCode })); });
    req.on('error', reject);
    req.end();
  });
  assert(open.status === 401 || open.status === 403,
    `anyone can read every enquiry — got ${open.status}`);

  const authed = await get('/enquiry/list');
  assert(authed.status === 200, `the office cannot read its own enquiries: ${authed.status}`);
  assert(Array.isArray(authed.data), 'the list should be an array');
});

test('landing: staff can still find their way in', async () => {
  const html = pub('home.html');
  // The app is at the root, so this is where a clerk who landed here goes.
  assert(/class="staff" href="\/"/.test(html), 'there is no way for a clerk to reach the app');
  assert(/rel="nofollow"/.test(html), 'the staff link is not nofollowed and will be crawled');
});

test('landing: crawlers are pointed at the one page worth indexing', async () => {
  const robots = pub('robots.txt');
  assert(/Sitemap: https:\/\/vgtc\.site\/sitemap\.xml/.test(robots), 'robots.txt names no sitemap');
  // The root is the login screen now, so it is disallowed along with the rest.
  for (const gated of ['/$', '/admin', '/labour', '/api/']) {
    assert(robots.includes(`Disallow: ${gated}`), `${gated} is behind a login but still crawlable`);
  }
  assert(/Disallow: \/home\.html/.test(robots), '/home.html would be crawled as a duplicate of /home');
  assert(/<loc>https:\/\/vgtc\.site\/home<\/loc>/.test(pub('sitemap.xml')),
    'the sitemap does not list the landing page');

  if (!distBuilt()) return;
  for (const f of ['/robots.txt', '/sitemap.xml']) {
    const res = await getPage(f);
    assert(res.status === 200, `${f} returned ${res.status} — crawlers cannot read it`);
  }
});

/* ── Loading receipt: typing the LR number ────────────────────────────────── */

test('lr: a clerk can type the LR number instead of taking the next one', async () => {
  // A paper bilty already written at the gate, or a book being caught up after
  // the fact — cases the counter cannot know about.
  const chosen = 900000 + Math.floor(Math.random() * 90000);
  const res = await post('/kosli/lr', {
    lrNo: chosen, date: '2026-08-04', truckNo: 'HR47G0975', partyName: 'MANUAL LR TEST',
    materials: [{ type: 'PPC', bags: '10', weight: '0.5', loadingType: 'From Godown' }],
  });
  assert(res.status === 201 || res.status === 200, `expected a receipt, got ${res.status} ${JSON.stringify(res.data)}`);
  assert(res.data.lrNo === chosen, `asked for #${chosen}, got #${res.data.lrNo}`);

  // The same number cannot be used twice — and it is the caller's mistake, so
  // it must not read as a server fault.
  const dup = await post('/kosli/lr', {
    lrNo: chosen, date: '2026-08-04', truckNo: 'HR47G0975', partyName: 'MANUAL LR TEST',
    materials: [{ type: 'PPC', bags: '10', weight: '0.5', loadingType: 'From Godown' }],
  });
  assert(dup.status === 409, `a duplicate must be refused with 409, got ${dup.status}`);
  assert(/already exists/i.test(JSON.stringify(dup.data)), `unhelpful message: ${JSON.stringify(dup.data)}`);

  for (const id of (res.data.ids || [])) await del('/kosli/lr/' + id);
});

test('lr: the automatic sequence never catches up with a typed number', async () => {
  // Type 900000 while the counter sits at 120 and every automatic number from
  // 900000 onwards would later collide with it. Claiming one moves the counter.
  const svc = require('../services/lrService');
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'services', 'lrService.js'), 'utf8');
  assert(/count: Math\.max\(data\.count \|\| 0, requested\)/.test(src),
    'a typed number does not advance the counter, so the sequence will collide with it');
  assert(/available: available\.filter\(n => n !== requested\)/.test(src),
    'a typed number is not removed from the freed-number pool, so it can be handed out twice');
  assert(typeof svc.createLoadingReceipt === 'function', 'the create entry point moved');
});

test('lr: a number that is not a number is refused, not coerced', async () => {
  // An LR number is an identity. parseInt('12abc') is 12, which would file the
  // receipt under a number nobody typed.
  for (const bad of ['abc', '0', '-4', '12.5abc']) {
    const res = await post('/kosli/lr', {
      lrNo: bad, date: '2026-08-04', truckNo: 'HR47G0975', partyName: 'BAD LR TEST',
      materials: [{ type: 'PPC', bags: '5', weight: '0.25', loadingType: 'From Godown' }],
    });
    assert(res.status === 400 || res.status === 409,
      `"${bad}" should be refused, got ${res.status} ${JSON.stringify(res.data)}`);
    if (res.data && res.data.ids) for (const id of res.data.ids) await del('/kosli/lr/' + id);
  }
});

test('lr: leaving the number blank still takes the next one automatically', async () => {
  // The toggle sends '' when switched on and left empty; that must mean "auto",
  // not "reject", or a clerk who changes their mind is stuck.
  const res = await post('/kosli/lr', {
    lrNo: '', date: '2026-08-04', truckNo: 'HR47G0975', partyName: 'AUTO LR TEST',
    materials: [{ type: 'PPC', bags: '5', weight: '0.25', loadingType: 'From Godown' }],
  });
  assert(res.status === 201 || res.status === 200, `expected a receipt, got ${res.status}`);
  assert(Number.isInteger(res.data.lrNo) && res.data.lrNo > 0,
    `no automatic number allocated: ${JSON.stringify(res.data)}`);
  for (const id of (res.data.ids || [])) await del('/kosli/lr/' + id);
});

test('lr: editing a number onto one already in use is refused', async () => {
  // Nothing checked this before, and letting a clerk type one makes it likelier.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'services', 'lrService.js'), 'utf8');
  const update = src.slice(src.indexOf('const updateLoadingReceipt'));
  assert(/lrNoTaken\(/.test(update.slice(0, 1200)),
    'the edit path still lets an LR number be moved onto one already in use');
});

test('lr: typing a number a voucher already uses says so, without refusing it', async () => {
  // The books were not started together — vouchers have been kept for months
  // while the receipts are only being entered now. A voucher on the number is
  // evidence the receipt belongs to that trip, so it is reported, not blocked.
  const lrNo = 700000 + Math.floor(Math.random() * 90000);

  const voucher = await post('/vouchers', {
    type: 'Kosli_Bill', lrNo: String(lrNo), date: '2026-08-04',
    truckNo: 'HR47G0975', destination: 'Rewari', partyName: 'VOUCHER FIRST TEST',
    weight: '25', rate: '700',
  });
  assert(voucher.status === 201 || voucher.status === 200,
    `could not create the voucher this test needs: ${voucher.status} ${JSON.stringify(voucher.data)}`);
  const voucherId = voucher.data?.id || voucher.data?.ids?.[0];

  const check = await get(`/kosli/lr/voucher-for/${lrNo}`);
  assert(check.status === 200, `expected 200, got ${check.status} ${JSON.stringify(check.data)}`);
  assert(check.data.voucher, 'the voucher on this LR was not found');
  assert(check.data.voucher.truckNo === 'HR47G0975', `wrong voucher matched: ${JSON.stringify(check.data.voucher)}`);
  assert(check.data.receiptExists === false, 'there is no receipt yet, so this must be false');

  // Reported, never refused — the receipt still goes through.
  const lr = await post('/kosli/lr', {
    lrNo, date: '2026-08-04', truckNo: 'HR47G0975', partyName: 'VOUCHER FIRST TEST',
    materials: [{ type: 'PPC', bags: '10', weight: '0.5', loadingType: 'From Godown' }],
  });
  assert(lr.status === 201 || lr.status === 200,
    `a voucher on the number must not block the receipt: ${lr.status} ${JSON.stringify(lr.data)}`);

  // And now the receipt does exist, which is the one thing that does refuse.
  const after = await get(`/kosli/lr/voucher-for/${lrNo}`);
  assert(after.data.receiptExists === true, 'the receipt was created but is not reported as existing');

  for (const id of (lr.data.ids || [])) await del('/kosli/lr/' + id);
  if (voucherId) await del('/vouchers/' + voucherId);
});

test('lr: the voucher check is scoped to the book being written in', async () => {
  // LR serials restart per plant. Without scoping, a Kosli number would match a
  // JK Lakshmi voucher that happens to share it and the warning would be wrong.
  const { PLANT_OF_LR_COLLECTION } = require('../routes/lrVoucherCheck');
  assert(PLANT_OF_LR_COLLECTION.kosli_loading_receipts === 'kosli_dump', 'Kosli is not scoped');
  assert(PLANT_OF_LR_COLLECTION.jkl_loading_receipts === 'jklakshmi_jharli', 'JK Lakshmi is not scoped');
  assert(PLANT_OF_LR_COLLECTION.loading_receipts === 'jksuper_jharli', 'the legacy book is not scoped');

  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'routes', 'lrVoucherCheck.js'), 'utf8');
  assert(/Bahadurgarh_Bill/.test(src),
    'Bahadurgarh has no invoice plant key, so it must be scoped by voucher type or it searches everything');
});

test('lr: an unknown number reports nothing rather than failing', async () => {
  // This runs while someone is still typing. It must never be an error state.
  const res = await get('/kosli/lr/voucher-for/999999999');
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(res.data.voucher === null, 'invented a voucher for a number nobody used');
  assert(res.data.receiptExists === false, 'invented a receipt');
});

test('all-balance: the header sits over the cell it names', async () => {
  // Found in production: PLANT showed a date, TRUCK showed an LR number, and
  // every money column after them read one place to the left — a rate under
  // "Destination", a gross under "Weight". VoucherRow accepted a documented
  // `leadCells` prop and never rendered it, so the combined sheet's two extra
  // headers stood over nothing and the whole row shifted.
  const path = require('path');
  const rowSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'BalanceSheet.jsx'), 'utf8');

  const row = rowSrc.slice(rowSrc.indexOf('export function VoucherRow'));
  assert(/leadCells = null/.test(row.slice(0, 400)), 'VoucherRow no longer accepts leadCells');

  // It has to render between the row number and the date, which is where the
  // combined sheet's Plant and Truck headers sit.
  const idxCell = row.indexOf('{idx + 1}');
  const lead = row.indexOf('{leadCells}');
  const dateCell = row.indexOf('{v.date}');
  assert(lead !== -1, 'leadCells is accepted but never rendered — every column after it shifts');
  assert(idxCell < lead && lead < dateCell,
    'leadCells must render between the row number and the date, or the headers stand over the wrong cells');

  // And the combined sheet must still be passing exactly the two it has
  // headers for.
  const allSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'AllBalanceSheet.jsx'), 'utf8');
  const passed = allSrc.slice(allSrc.indexOf('leadCells={<>'), allSrc.indexOf('leadCells={<>') + 900);
  assert(/v\.plant/.test(passed) && /v\.truckNo/.test(passed),
    'the combined sheet no longer supplies the plant and truck its headers promise');
  assert((passed.match(/<td/g) || []).length === 2,
    'the number of lead cells no longer matches the two extra headers');
});

test('balance: a ticked row is still obvious without the box around it', async () => {
  // The outline drew a bracket around every multi-LR voucher, because ticking
  // one leg ticks them all. Removing it is only safe while the tint still says
  // which rows are picked -- drop both and nothing does.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'BalanceSheet.jsx'), 'utf8');

  assert(/const bg = checked ? /.test(src),
    'a selected row no longer looks different from an unselected one');
  assert(!/outline: checked/.test(src),
    'the selection outline is back, and it brackets every multi-LR voucher');
});

test('all-balance: a multi-LR voucher can be sent to pay', async () => {
  // Reported from production: ticking a multi-LR voucher and pressing Send to
  // Pay did nothing. Every leg shares the parent key, a Map keeps the last
  // value for a repeated key, and the last leg has `_leg > 0` -- which the
  // filter then dropped, so the voucher fell out of the selection entirely.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AllBalanceSheet.jsx'), 'utf8');
  const memo = src.slice(src.indexOf('const selVouchers'), src.indexOf('const sendable'));

  assert(/_original \|\| r/.test(memo),
    'the selection still keeps a leg rather than the voucher it belongs to');
  assert(!/filter\(v => !\(v\._leg > 0\)\)/.test(memo),
    'the leg filter is back, and it throws the voucher away with the last leg');

  // Status has to be worked out on the voucher. A leg is never "pending" on
  // its own terms once the deductions sit on the first one.
  assert(/calcNet\(voucher, vehicle\)/.test(memo),
    'status and outstanding are not recomputed on the whole voucher');
});

test('all-balance: the selection total adds vouchers, not legs', async () => {
  // A leg whose deductions outrun its own freight reports zero outstanding
  // rather than a negative one, so adding legs up overstates the trip:
  // -5,860 + 4,740 + 2,370 is 7,110 as legs and 1,250 as a voucher.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AllBalanceSheet.jsx'), 'utf8');
  assert(!/selRows\.reduce\(\(s, v\) => s \+ v\._outstanding, 0\)/.test(src),
    'the selection bar sums legs, which overstates any voucher with a negative first leg');
  assert(/selVouchers\.reduce\(\(s, v\) => s \+ v\._outstanding, 0\)/.test(src),
    'the selection bar no longer shows an outstanding total at all');
});

test('all-balance: a continuation LR is marked as one', async () => {
  // Without a mark the second and third LRs read as unrelated trips that
  // happen to share a truck and a date.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'BalanceSheet.jsx'), 'utf8');
  // Asserting the file merely contains the name is worthless: the JSX usage
  // satisfies it. What matters is that the icon is imported, and this test
  // passed while the app was crashing on exactly that.
  const imports = src.slice(0, src.indexOf("from 'lucide-react'"));
  assert(/CornerDownRight/.test(imports), 'CornerDownRight is used but never imported');
  // It lives in the tick-box cell: that is what a leg shares with its
  // voucher, since ticking any leg ticks them all.
  const cell = src.slice(src.indexOf('t-card-checkbox'), src.indexOf('t-card-checkbox') + 700);
  assert(/v._leg > 0/.test(cell), 'the mark is not tied to the legs after the first');
  assert(/CornerDownRight/.test(cell), 'the mark is not in the tick-box cell');
});

/** Lift a top-level declaration out of a .jsx file and run it for real. */
function liftFromBalanceSheet(header, name) {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'BalanceSheet.jsx'), 'utf8');
  const i = src.indexOf(header);
  if (i === -1) throw new Error('declaration not found: ' + header);
  let depth = 0, started = false, end = -1;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { end = j + 1; break; } }
  }
  if (end === -1) throw new Error('unbalanced braces in ' + header);
  return new Function(src.slice(i, end) + '; return ' + name + ';')();
}

test('balance: a multi-drop voucher is not called unpriced', async () => {
  // Reported from production: every voucher carrying more than one LR was
  // refused at Send to Pay for a rate that was plainly on the screen. The rate
  // box at the top of the voucher form is not used once drops are added, and
  // the saved record keeps it empty -- so the check was reading a field that is
  // empty by design and calling the trip unrated.
  const payBlockers = liftFromBalanceSheet('function payBlockers(v) {', 'payBlockers');

  const voucher = {
    rate: '', lrNo: '2',
    deliveries: [
      { lrNo: '1236', destination: 'Rewari', weight: '10', rate: '400' },
      { lrNo: '1237', destination: 'Bhiwani', weight: '2', rate: '365' },
    ],
  };
  assert(payBlockers(voucher).length === 0,
    'a voucher with every drop priced is still being refused: ' + JSON.stringify(payBlockers(voucher)));
});

test('balance: an unpriced drop is named by its LR number', async () => {
  // The old message named the voucher's own lrNo, which on a multi-drop record
  // is whatever was left in the form -- an LR number the yard has never seen.
  // Nobody could act on it. Name the drop that is actually missing a rate.
  const payBlockers = liftFromBalanceSheet('function payBlockers(v) {', 'payBlockers');

  const problems = payBlockers({
    rate: '', lrNo: '2',
    deliveries: [
      { lrNo: '1236', rate: '400' },
      { lrNo: '1237', rate: '' },
    ],
  });
  assert(problems.length === 1, 'expected exactly one problem, got ' + JSON.stringify(problems));
  assert(problems[0].includes('#1237'), 'the unpriced drop is not named: ' + problems[0]);
  assert(!problems[0].includes('#1236'), 'a priced drop is being blamed too: ' + problems[0]);
});

test('balance: a single-drop voucher still needs its rate', async () => {
  // The multi-drop branch must not become a way past the check for the ordinary
  // voucher, which is the overwhelming majority of them.
  const payBlockers = liftFromBalanceSheet('function payBlockers(v) {', 'payBlockers');

  assert(JSON.stringify(payBlockers({ rate: '', weight: '10' })) === JSON.stringify(['Rate not entered']),
    'an unpriced single-drop voucher is no longer caught');
  assert(payBlockers({ rate: '365', weight: '10' }).length === 0,
    'a priced single-drop voucher is being refused');

  // And the other two bars are untouched.
  assert(payBlockers({ rate: '365', advanceDiesel: '3500' }).includes('Diesel not verified'),
    'unverified diesel no longer blocks');
  assert(payBlockers({ rate: '365', advanceOnline: '2000' }).includes('Online advance not paid'),
    'an unpaid online advance no longer blocks');
});

test('balance: the blocked-send dialogs name the LRs on the voucher', async () => {
  // Both sheets showed `LR #{v.lrNo}`, which is the leftover form field on a
  // multi-drop voucher. The user read it as a row number, because that is what
  // it looked like.
  const path = require('path'), fs = require('fs');
  const dir = path.join(__dirname, '..', '..', 'client', 'src', 'modules');
  const bal = fs.readFileSync(path.join(dir, 'BalanceSheet.jsx'), 'utf8');
  const all = fs.readFileSync(path.join(dir, 'AllBalanceSheet.jsx'), 'utf8');

  const lrLabelOf = liftFromBalanceSheet('const lrLabelOf = (v) => {', 'lrLabelOf');
  assert(lrLabelOf({ lrNo: '2', deliveries: [{ lrNo: '1236' }, { lrNo: '1237' }] }) === '#1236 + #1237',
    'a multi-drop voucher is not labelled by its drops');
  assert(lrLabelOf({ lrNo: '1189' }) === '#1189', 'a plain voucher lost its LR');
  assert(lrLabelOf({}) === String.fromCharCode(8212), 'a voucher with no LR should read as a dash');

  for (const [name, src] of [['BalanceSheet', bal], ['AllBalanceSheet', all]]) {
    const dialog = src.slice(src.indexOf('sendBlocked.map'), src.indexOf('sendBlocked.map') + 900);
    assert(/lrLabelOf\(v\)/.test(dialog), name + ': the blocked dialog does not use lrLabelOf');
    assert(!/LR #\{v\.lrNo/.test(dialog), name + ': the blocked dialog still prints the raw lrNo');
  }

  // The name has to be imported, not merely used -- a missing import is a blank
  // screen, and it has happened here before.
  const imp = all.slice(0, all.indexOf('\n\n', all.indexOf("from './BalanceSheet'")));
  assert(/import \{[^}]*\blrLabelOf\b[^}]*\} from '\.\/BalanceSheet'/s.test(imp),
    'AllBalanceSheet uses lrLabelOf without importing it');
});

test('all-balance: two scrollbars do not chase each other', async () => {
  // The rail above the table and the table's own bar are kept in step by
  // writing one's scrollLeft from the other. That write fires a scroll event on
  // the box written to, which would write back, for as long as the mouse is
  // held -- a locked tab, not a slow one.
  const all = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'components', 'TableScroll.jsx'), 'utf8');
  const i = all.indexOf('export function mirrorScroll');
  assert(i !== -1, 'mirrorScroll is gone');
  let depth = 0, started = false, end = -1;
  for (let j = i; j < all.length; j++) {
    if (all[j] === '{') { depth++; started = true; }
    else if (all[j] === '}') { depth--; if (started && depth === 0) { end = j + 1; break; } }
  }
  const mirrorScroll = new Function(all.slice(i, end).replace('export ', '') + '; return mirrorScroll;')();

  // Two boxes that report a scroll event whenever they are written to, which
  // is what a browser does.
  const frames = [];
  global.requestAnimationFrame = fn => frames.push(fn);
  const driving = { current: null };
  let writes = 0;
  const make = () => {
    const el = { _v: 0 };
    Object.defineProperty(el, 'scrollLeft', {
      get: () => el._v,
      set: v => { el._v = v; writes++; if (writes < 50) el.onScroll(); },
    });
    return { current: el };
  };
  const rail = make(), wrap = make();
  rail.current.onScroll = () => mirrorScroll(driving, rail, wrap);
  wrap.current.onScroll = () => mirrorScroll(driving, wrap, rail);

  // The user drags the rail.
  rail.current._v = 420;
  rail.current.onScroll();

  assert(writes < 50, 'the two bars are still echoing each other -- ' + writes + ' writes');
  assert(writes === 1, 'expected exactly one mirrored write, got ' + writes);
  assert(wrap.current.scrollLeft === 420, 'the table did not follow the rail');

  // The mark has to be released, or the rail never moves again.
  frames.forEach(fn => fn());
  assert(driving.current === null, 'the guard was never cleared, so scrolling is dead after one drag');

  wrap.current._v = 900;
  wrap.current.onScroll();
  assert(rail.current.scrollLeft === 900, 'the rail no longer follows the table');
  delete global.requestAnimationFrame;
});

test('all-balance: the rail only appears when there is something off-screen', async () => {
  // A scrollbar on a table that already fits is a control that does nothing.
  const fs = require('fs'), path = require('path');
  const src = path.join(__dirname, '..', '..', 'client', 'src');
  const comp = fs.readFileSync(path.join(src, 'components', 'TableScroll.jsx'), 'utf8');

  assert(/needsRail = tableW > wrapW/.test(comp),
    'the rail is no longer conditional on the table overflowing');
  assert(/\{needsRail && \(/.test(comp), 'the rail is rendered unconditionally');

  // Both boxes must actually be wired up, or the rail scrolls nothing.
  assert(/ref=\{wrapRef\}[\s\S]{0,120}onScroll=/.test(comp), 'the table box is not wired to the rail');
  assert(/ref=\{railRef\} className="tbl-scroll-top"/.test(comp), 'the rail is not wired to the table');

  // And every wide table has to go through it, or only one list gets the rail.
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.name.endsWith('.jsx')) out.push(full);
    }
    return out;
  };
  // TableScroll itself is the implementation, and its own doc comment quotes
  // the markup it replaces.
  const stragglers = walk(src)
    .filter(f => path.basename(f) !== 'TableScroll.jsx')
    .filter(f => /className="tbl-wrap/.test(fs.readFileSync(f, 'utf8')));
  assert(stragglers.length === 0,
    'these still use a bare tbl-wrap and get no top scrollbar: ' +
    stragglers.map(f => path.basename(f)).join(', '));

  // Anything using it must import it, or the module is a blank screen.
  const users = walk(src).filter(f => /<TableScroll[\s>]/.test(fs.readFileSync(f, 'utf8')));
  assert(users.length >= 15, 'only ' + users.length + ' modules use the shared wrapper');
  for (const f of users) {
    assert(/import TableScroll from '[^']+'/.test(fs.readFileSync(f, 'utf8')),
      path.basename(f) + ' uses TableScroll without importing it');
  }
});

test('all-balance: the widest sheet is not capped at 1440px', async () => {
  // Nineteen columns on a 2,500px monitor left a third of the screen empty
  // while the table still had to be dragged sideways.
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', '..', 'client', 'src');
  const css = fs.readFileSync(path.join(dir, 'index.css'), 'utf8');
  const all = fs.readFileSync(path.join(dir, 'modules', 'AllBalanceSheet.jsx'), 'utf8');

  // Every list with a sideways scrollbar widens, not just this one — the rule
  // keys on the table wrapper, so a module gets it by using TableScroll.
  assert(/\.page-content:has\(\.tbl-wrap\)[\s\S]{0,80}max-width:\s*none/.test(css),
    'pages holding a wide table no longer widen');
  assert(/\.page-content:has\(> \.page-full\)/.test(css),
    'the explicit opt-in for a full-width page is missing');
  assert(/<div className="page-full">/.test(all),
    'All Balance Sheet no longer opts into the full width');

  // Keyed on the wrapper, never on the scrollbar: keying it on .tbl-scroll-top
  // would widen the page, let the table fit, drop the scrollbar and narrow it
  // again, for as long as the page is open.
  assert(!/\.page-content:has\([^)]*tbl-scroll-top/.test(css),
    'the width now depends on the scrollbar it controls, which oscillates');

  // The cap must survive for everything else -- a form stretched to 2,500px is
  // worse than one that is too narrow.
  assert(/\.page-content\s*\{[^}]*max-width:\s*1440px/.test(css),
    'the default page cap has been removed, which widens every form too');
});

test('all-balance: a PDF can be taken of the ticked rows alone', async () => {
  const all = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AllBalanceSheet.jsx'), 'utf8');

  assert(/const exportRows = \(list = filtered\)/.test(all),
    'the export builder still hard-codes the full filtered list');
  assert(/exportRows\(selRows\)/.test(all),
    'nothing exports the selection');
  assert(/PDF \(\{selRows\.length\} selected\)/.test(all),
    'the selected-only button does not say how many rows it will print');

  // The full export must still be there. Replacing it would mean no way to
  // print the whole sheet once anything is ticked.
  assert(/exportToPDF\(exportRows\(\),/.test(all), 'the full-sheet PDF export is gone');
  assert(/exportToExcel\(exportRows\(\),/.test(all), 'the Excel export is gone');
});

test('enquiry: the daily cap still applies in production', async () => {
  // The cap was relaxed off the live deploy so the suite could run twice in one
  // dev server -- six posts a run against a max of six meant every second run
  // was nothing but 429s. That relaxation must not reach the public form, which
  // is the only unauthenticated door into this server.
  //
  // Asserted on the source rather than by reloading envConfig: that module
  // decides the Firestore collection prefix, and re-requiring it with APP_ENV
  // flipped would point the rest of this suite at the production collections.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'routes', 'enquiryRoutes.js'), 'utf8');

  assert(/MAX_PER_DAY = isProduction\(\) \? 6 :/.test(src),
    'the production cap is no longer six a day');
  assert(/max: MAX_PER_DAY/.test(src),
    'the limiter is not reading the cap');
  assert(/require\('\.\.\/utils\/envConfig'\)/.test(src),
    'isProduction is used without being imported');
});

test('all-balance: every leg of a voucher lands in the same tab', async () => {
  // Reported from production: opening "Sent to Pay" showed one LR of a
  // multi-LR trip and hid the rest.
  //
  // Status was worked out per row. A leg carries only its own freight, while
  // the diesel, cash, munshi and the payment all sit on the first one -- so the
  // first leg of a heavily-advanced trip owes nothing and reads "paid", while
  // its siblings still owe and read "sent". One voucher, three tabs, and no tab
  // showing the whole trip.
  const all = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AllBalanceSheet.jsx'), 'utf8');
  const memo = all.slice(all.indexOf('const rows = useMemo'), all.indexOf('const filtered = useMemo'));

  assert(/voucherState/.test(memo), 'status is no longer worked out per voucher');
  assert(/sentIds\.has\(v\.id\)/.test(memo),
    'sent-ness is being asked of a leg id again');
  assert(/\.\.\.voucherState\.get\(v\._parentId \|\| v\.id\)/.test(memo),
    'the voucher status is not stamped onto each leg');

  // The status must not be recomputed from the leg after that, or the stamp is
  // undone by the next line.
  const afterStamp = memo.slice(memo.indexOf('voucherState.get'));
  assert(!/_status:/.test(afterStamp), 'a per-leg _status is still being written after the stamp');

  // Reproduce the arithmetic the fix relies on, with the numbers off the
  // reported voucher: freight 4,740 + 4,740 + 2,370 against a 10,000 diesel
  // advance, 100 munshi and 500 commission.
  const legNets = [4740 - 10000 - 100 - 500, 4740, 2370];
  const legStatus = legNets.map(n => (Math.max(0, n) <= 0 ? 'paid' : 'sent'));
  assert(new Set(legStatus).size === 2,
    'the fixture no longer reproduces the split that caused the bug');

  const voucherNet = legNets.reduce((a, b) => a + b, 0);
  assert(voucherNet === 1250, 'voucher net should be 1,250, got ' + voucherNet);
  assert(Math.max(0, voucherNet) > 0, 'the voucher still owes, so every leg belongs under Sent to Pay');
});

test('all-balance: the outstanding total counts a voucher once', async () => {
  // Same root cause, on the money. Outstanding is floored at zero per row, so
  // the first leg contributes nothing rather than offsetting its siblings:
  // 0 + 4,740 + 2,370 reads as 7,110 owed on a trip that owes 1,250.
  const all = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'AllBalanceSheet.jsx'), 'utf8');
  const totals = all.slice(all.indexOf('const totals = useMemo'), all.indexOf('/* ── Selection'));

  assert(/counted/.test(totals) && /firstSeen/.test(totals),
    'the outstanding total no longer de-duplicates by voucher');
  assert(/_voucherOutstanding/.test(totals),
    'the total is back to adding each leg up');

  const legs = [
    { _parentId: 'v1', id: 'v1', _outstanding: 0, _voucherOutstanding: 1250 },
    { _parentId: 'v1', id: 'v1::leg1', _outstanding: 4740, _voucherOutstanding: 1250 },
    { _parentId: 'v1', id: 'v1::leg2', _outstanding: 2370, _voucherOutstanding: 1250 },
  ];
  const counted = new Set();
  const total = legs.reduce((acc, v) => {
    const vid = v._parentId || v.id;
    const first = !counted.has(vid);
    if (first) counted.add(vid);
    return acc + (first ? v._voucherOutstanding : 0);
  }, 0);
  assert(total === 1250, 'expected 1,250 outstanding on the voucher, got ' + total);

  const naive = legs.reduce((a, v) => a + v._outstanding, 0);
  assert(naive === 7110, 'the fixture no longer reproduces the overstatement');
});

test('pay: a multi-LR trip names its real LRs', async () => {
  // Pay printed the voucher's own lrNo, which on a multi-drop record is the
  // leftover form field -- the "2" the user read as a row number.
  const fs = require('fs'), path = require('path');
  const pay = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'PayModule.jsx'), 'utf8');

  assert(!/#\{v\.lrNo\}/.test(pay), 'a Pay table still prints the raw lrNo');
  assert(!/lrNo: v\.lrNo/.test(pay), 'the expense strip still labels with the raw lrNo');
  assert((pay.match(/lrLabelOf\(v\)/g) || []).length >= 8,
    'not every LR cell in Pay was switched over');
  assert(/import \{[^}]*\blrLabelOf\b[^}]*\} from '\.\/BalanceSheet'/s.test(pay),
    'PayModule uses lrLabelOf without importing it');
});

test('challan: a factory code is kept, and normalised', async () => {
  // createChallan names every field it stores, so anything the form sends that
  // is not in that list is dropped without a word. A code typed into the form
  // and silently lost would be worse than no field at all.
  const svcSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils', 'stockService.js'), 'utf8');
  const create = svcSrc.slice(svcSrc.indexOf('createChallan: async'), svcSrc.indexOf('updateChallanStatus:'));

  assert(/factoryCode \} = data|, factoryCode/.test(create),
    'createChallan does not read factoryCode off the request');
  assert((create.match(/factoryCode: cleanFactoryCode/g) || []).length === 2,
    'both the Firestore and the local-store paths must store it — found ' +
    (create.match(/factoryCode: cleanFactoryCode/g) || []).length);

  // Upper-cased and trimmed: fc1 and FC1 are one gate, not two, and every
  // grouping or filter downstream compares them as strings.
  const clean = new Function('factoryCode',
    "return String(factoryCode || '').trim().toUpperCase().slice(0, 16);");
  assert(clean(' fc5 ') === 'FC5', 'a lower-case code is not normalised: ' + clean(' fc5 '));
  assert(clean('FC1') === 'FC1', 'a good code was altered');
  assert(clean(undefined) === '', 'a missing code should be blank, not "undefined"');
  assert(clean('x'.repeat(50)).length === 16, 'a long code is not capped');
});

test('challan: the factory code is offered, saved and shown', async () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', '..', 'client', 'src', 'modules');
  const stock = fs.readFileSync(path.join(dir, 'StockModule.jsx'), 'utf8');
  const lr = fs.readFileSync(path.join(dir, 'LRModule.jsx'), 'utf8');

  // Offered on both forms that raise a challan.
  assert(/getEmptyChal = \(\) => \(\{[^}]*factoryCode: ''/.test(stock),
    'the Stock challan form does not start with a factoryCode field');
  assert(/factoryCode: ''/.test(lr),
    'the LR quick-create modal does not carry a factoryCode');
  assert((stock.match(/e\.target\.value\.toUpperCase\(\)/g) || []).length >= 1 &&
    /toUpperCase\(\)/.test(lr),
    'the field does not upper-case as it is typed');

  // Visible once saved, or there is no way to check what was entered.
  assert(/c\.factoryCode \|\| '—'/.test(stock), 'the challan list has no factory code column');
  assert(/colKey="factoryCode"/.test(stock), 'the factory code cannot be filtered on');
  assert(/factoryCode: challan\.factoryCode/.test(stock), 'the export drops the factory code');
  assert(/c\.factoryCode \?/.test(stock), 'the printed slip never shows the factory code');

  // Header and cell must be inserted at the same position. This table has
  // drifted before, and a shifted column reads as the wrong data entirely.
  // Six tables live in this file; anchor on the challan one.
  const anchor = stock.indexOf('label="Challan #"');
  assert(anchor !== -1, 'the challan table header is gone');
  const head = stock.slice(stock.lastIndexOf('<thead><tr>', anchor), stock.indexOf('</tr></thead>', anchor));
  const cols = ['challanNo', 'date', 'truckNo', 'material', 'Qty (bags)', 'partyName', 'factoryCode', 'Remark'];
  let at = -1;
  for (const c of cols) {
    const next = head.indexOf(c, at + 1);
    assert(next > at, 'challan header column out of order at "' + c + '"');
    at = next;
  }
});

test('migo: the arrival list shows how it was unloaded', async () => {
  const fs = require('fs'), path = require('path');
  const stock = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'modules', 'StockModule.jsx'), 'utf8');

  const anchor = stock.indexOf('Stock Arrival History (MIGO)');
  assert(anchor !== -1, 'the MIGO history table is gone');
  const table = stock.slice(anchor, stock.indexOf('{/* ── CHALLAN TAB ── */}', anchor));

  assert(/<th style=\{TH\}>Unloading Type<\/th>/.test(table),
    'the MIGO list has no unloading type column');
  assert(/a\.unloadingType \|\| 'Godown Unload'/.test(table),
    'rows saved before the field existed have no fallback — they were all godown unloads');
  assert(/no labour/.test(table),
    'nothing on the row says which arrivals the labour account was not charged for');

  // Header order must match cell order, or every column reads as its neighbour.
  const head = table.slice(table.indexOf('<thead><tr>'), table.indexOf('</tr></thead>'));
  const body = table.slice(table.indexOf('<tbody>'));
  const headCols = ['Date', 'Truck #', 'Material', 'Quantity', 'Unloading Type', 'Remark'];
  let at = -1;
  for (const c of headCols) {
    const next = head.indexOf('>' + c + '<');
    assert(next > at, 'MIGO header out of order at "' + c + '"');
    at = next;
  }
  const bodyCols = ['fmtDate(a.date)', 'a.truckNo', 'a.material', 'a.quantity', 'a.unloadingType', 'a.remark'];
  at = -1;
  for (const c of bodyCols) {
    const next = body.indexOf(c);
    assert(next > at, 'MIGO cells out of order at "' + c + '" — the column sits under the wrong header');
    at = next;
  }

  // The quantity header has to sit over its figures, which are right-aligned.
  assert(/<th style=\{\{ \.\.\.TH, textAlign: 'right' \}\}>Quantity<\/th>/.test(table),
    'the Quantity header is not aligned with the numbers under it');

  // The empty row has to span the columns that are actually there.
  assert(/colSpan=\{role === 'admin' \? 8 : 7\}/.test(table),
    'the "no arrivals" row spans the wrong number of columns');
});

test('migo: only a godown unload is charged to labour', async () => {
  // The colour on the list is a claim about money, so it has to agree with the
  // service that actually bills it.
  const svc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils', 'labourAccountService.js'), 'utf8');
  const stock = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils', 'stockService.js'), 'utf8');

  assert(/UNLOADING_TYPES\.includes\(unloadingType\)/.test(stock),
    'an arrival can be saved with an unloading type nobody recognises');
  assert(/'Godown Unload'/.test(svc), 'the labour service no longer knows the paying type');

  const ui = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'client', 'src', 'modules', 'StockModule.jsx'), 'utf8');
  const table = ui.slice(ui.indexOf('Stock Arrival History (MIGO)'));
  assert(/paid = t === 'Godown Unload'/.test(table),
    'the list decides "paid" on something other than a godown unload');
});

/** Width, height and colour type straight out of the PNG header. */
function pngHeader(file) {
  const b = require('fs').readFileSync(file);
  assert(b.slice(0, 8).toString('hex') === '89504e470d0a1a0a', file + ' is not a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colourType: b[25], bytes: b.length };
}

test('brand: the icons are real files at the sizes they claim', async () => {
  const path = require('path');
  const pub = path.join(__dirname, '..', '..', 'client', 'public');

  const expected = [
    ['favicon-32.png', 32], ['favicon-48.png', 48],
    ['icon-192.png', 192], ['icon-512.png', 512],
    ['apple-touch-icon.png', 180], ['icon-512-maskable.png', 512],
  ];
  for (const [name, size] of expected) {
    const h = pngHeader(path.join(pub, name));
    assert(h.w === size && h.h === size,
      name + ' should be ' + size + 'x' + size + ', is ' + h.w + 'x' + h.h);
  }

  // A favicon that is heavier than the page it labels is a bug of its own.
  assert(pngHeader(path.join(pub, 'favicon-32.png')).bytes < 12 * 1024,
    'favicon-32.png is too heavy for something fetched on every page load');

  // iOS composites a transparent icon onto black and this logo is navy, so the
  // touch icon must be opaque. Colour type 6 is RGBA, 2 is RGB.
  assert(pngHeader(path.join(pub, 'apple-touch-icon.png')).colourType === 2,
    'apple-touch-icon.png still has an alpha channel — it will render navy on black');
  assert(pngHeader(path.join(pub, 'icon-512-maskable.png')).colourType === 2,
    'a maskable icon must be opaque, or the platform mask shows through');

  // The wordmark keeps its 3:1 shape; the watermark is derived from it.
  const logo = pngHeader(path.join(pub, 'vgtc-logo.png'));
  assert(Math.abs(logo.w / logo.h - 3.05) < 0.1,
    'the logo is no longer the 3:1 wordmark: ' + (logo.w / logo.h).toFixed(2) + ':1');
  const wm = pngHeader(path.join(pub, 'vgtc-watermark.png'));
  assert(Math.abs(wm.w / wm.h - logo.w / logo.h) < 0.05, 'the watermark was distorted');
  assert(wm.bytes < logo.bytes, 'the watermark is not a lighter copy of the logo');
});

test('brand: the icons are actually referenced', async () => {
  const fs = require('fs'), path = require('path');
  const client = path.join(__dirname, '..', '..', 'client');
  const html = fs.readFileSync(path.join(client, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(client, 'public', 'manifest.json'), 'utf8'));

  assert(/rel="icon"[^>]*href="\/favicon-32\.png"/.test(html), 'the 32px favicon is not linked');
  assert(/rel="apple-touch-icon" href="\/apple-touch-icon\.png"/.test(html),
    'the iOS icon still points at the old SVG');

  const srcs = manifest.icons.map(i => i.src);
  assert(srcs.includes('/icon-192.png') && srcs.includes('/icon-512.png'),
    'the manifest does not offer PNG icons: ' + JSON.stringify(srcs));
  const maskable = manifest.icons.find(i => i.purpose === 'maskable');
  assert(maskable && maskable.src === '/icon-512-maskable.png',
    'the maskable icon is missing, so an installed app gets a cropped logo');
  assert(!srcs.includes('/vgtc-logo.svg'),
    'the manifest still points at the placeholder SVG logo');

  // A browser prefers an SVG icon over any PNG when both are offered, so
  // leaving the old placeholder linked meant the tab never changed however the
  // PNGs were regenerated.
  assert(!/rel="icon"[^>]*favicon\.svg/.test(html),
    'the placeholder SVG favicon is still linked and will win over the PNGs');
  assert(!srcs.includes('/favicon.svg'),
    'the manifest still offers the placeholder SVG icon');

  // No coloured tile behind the logo — the mark carries its own brand.
  const css = fs.readFileSync(path.join(client, 'src', 'index.css'), 'utf8');
  const brand = css.slice(css.indexOf('.brand-icon {'), css.indexOf('.brand-text'));
  assert(!/background:/.test(brand),
    'the sidebar still paints a gradient tile behind the logo');
});

test('brand: every printed document carries the watermark', async () => {
  const fs = require('fs'), path = require('path');
  const src = path.join(__dirname, '..', '..', 'client', 'src');

  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f, out); else if (/\.jsx?$/.test(e.name)) out.push(f);
    }
    return out;
  };

  // Anything that builds a whole document to print must apply the mark.
  const printers = walk(src).filter(f => fs.readFileSync(f, 'utf8').includes('<!DOCTYPE html>'));
  assert(printers.length >= 5, 'expected several print documents, found ' + printers.length);
  for (const f of printers) {
    assert(/[wW]atermarkCss/.test(fs.readFileSync(f, 'utf8')),
      path.basename(f) + ' builds a printable document with no watermark on it');
  }

  const rp = fs.readFileSync(path.join(src, 'utils', 'receiptPrint.js'), 'utf8');
  const css = rp.slice(rp.indexOf('export const watermarkCss'), rp.indexOf('const shellCss'));

  // A print window is opened blank and written into, so its base URL is
  // about:blank and a root-relative path resolves to nothing.
  assert(/window\.location\.origin/.test(css),
    'the watermark URL is relative — it will not resolve in a print window');

  // Faint enough to print under figures people are paid to read, on both the
  // A4 default and the stronger setting the thermal slips ask for.
  const def = rp.match(/watermarkCss = \(scale = [\d.]+, opacity = ([\d.]+)\)/);
  assert(def, 'watermarkCss no longer takes an opacity with a default');
  assert(parseFloat(def[1]) > 0 && parseFloat(def[1]) <= 0.12,
    'default watermark opacity ' + def[1] + ' will compete with the numbers on a report');
  assert(/opacity:\s*\$\{opacity\}/.test(css), 'the opacity argument is not actually used');

  // A thermal head has no greys — it burns a dot or it does not — so the faint
  // A4 setting dithers away to nothing on a slip.
  const slip = rp.match(/slipWatermarkCss = \(\) => watermarkCss\([\d.]+,\s*([\d.]+)\)/);
  const report = rp.match(/reportWatermarkCss = \(\) => watermarkCss\([\d.]+,\s*([\d.]+)\)/);
  assert(slip && report, 'the slip and report presets are gone');
  assert(parseFloat(slip[1]) > parseFloat(report[1]),
    'the slip watermark is no stronger than the report one, so it will not survive thermal printing');
  assert(parseFloat(slip[1]) <= 0.22,
    'the slip watermark at ' + slip[1] + ' is strong enough to fight the figures on it');

  // Every print document must pick a preset. The bare builder defaults to the
  // report setting, which is how the voucher — a slip — ended up with a mark
  // too faint to print.
  for (const f of printers) {
    const t = fs.readFileSync(f, 'utf8');
    assert(/slipWatermarkCss\(\)|reportWatermarkCss\(\)/.test(t),
      path.basename(f) + ' uses the raw watermark builder instead of choosing slip or report');
  }

  assert(/rotate\(-?\d+deg\)/.test(css), 'the watermark is not rotated');

  // Over the document, not under it. A voucher is a stack of bordered white
  // boxes; painted behind the content the mark survived only in the gaps
  // between rows, which is how it reached production looking half-printed.
  assert(/body::after/.test(css) && !/body::before/.test(css),
    'the watermark is painted behind the content again — opaque rows will hide it');
  assert(/z-index:\s*2147483647/.test(css),
    'the watermark overlay is not above the content it has to cover');
  assert(/pointer-events:\s*none/.test(css),
    'an overlay without pointer-events:none swallows the Print button');
  assert(/position:\s*fixed/.test(css),
    'the watermark is not fixed, so a long report gets it on the first page only');
  assert(/print-color-adjust:\s*exact/.test(css),
    'without print-color-adjust the browser drops the mark when it goes to paper');
});

test('brand: every slip carries the logo at its head', async () => {
  const fs = require('fs'), path = require('path');
  const src = path.join(__dirname, '..', '..', 'client', 'src');
  const rp = fs.readFileSync(path.join(src, 'utils', 'receiptPrint.js'), 'utf8');

  // Injected by the shared shell, not pasted into each template — there are
  // half a dozen slip templates and the next one added would have been missed.
  assert(/\$\{receiptLogoHtml\(\)\}\n\$\{body\}/.test(rp.replace(/\r/g, '')),
    'the logo is no longer put at the top of every slip the shell builds');
  assert(/\$\{receiptLogoCss\}/.test(rp), 'the logo styling is not in the shell');

  // Same absolute-URL rule as the watermark: a print window is written into a
  // blank document, so a relative path resolves to nothing.
  const logo = rp.slice(rp.indexOf('export const receiptLogoHtml'), rp.indexOf('export const receiptLogoCss'));
  assert(/window\.location\.origin/.test(logo),
    'the slip logo uses a relative URL and will not load in a print window');

  // Sized in millimetres. This is paper, and a pixel height means nothing to a
  // thermal head; height only, or the 3:1 wordmark gets squashed.
  const css = rp.slice(rp.indexOf('export const receiptLogoCss'), rp.indexOf('const shellCss'));
  assert(/height:\s*\d+(\.\d+)?mm/.test(css), 'the slip logo is not sized in millimetres');
  assert(/width:\s*auto/.test(css), 'the slip logo has a fixed width and will be distorted');
  assert(/print-color-adjust:\s*exact/.test(css),
    'without print-color-adjust the logo can be dropped when the slip goes to paper');

  // The challan builds its own document rather than using the shell.
  const stock = fs.readFileSync(path.join(src, 'modules', 'StockModule.jsx'), 'utf8');
  assert(/receiptLogoHtml\(\)/.test(stock), 'the challan has no logo at its head');
  assert(/import \{[^}]*receiptLogoHtml[^}]*\} from '\.\.\/utils\/receiptPrint'/.test(stock),
    'StockModule uses the slip logo without importing it');
});

// Run
runAll();
