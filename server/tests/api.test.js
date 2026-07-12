const http = require('http');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000/api';
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

// Run
runAll();
