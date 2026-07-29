/**
 * seedAttendanceDemo.js — demo drivers, staff and trip records for trying out the
 * attendance roll-call.
 *
 *   node server/scripts/seedAttendanceDemo.js          # create
 *   node server/scripts/seedAttendanceDemo.js --clean  # remove everything it created
 *
 * Every document it writes carries `demoSeed: true`, which is how --clean finds them
 * again. Nothing else is touched.
 *
 * Refuses to run against production unless --force is passed, because demo people
 * would otherwise land in real payroll figures.
 */

require('dotenv').config();
const { db, admin, isAvailable } = require('../firebase');
const { isProduction, ENV, getEnvPrefix } = require('../utils/envConfig');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');

const CLEAN = process.argv.includes('--clean');
const FORCE = process.argv.includes('--force');
const ORG = process.env.DEMO_ORG_ID || 'vgtc';
const TAG = 'demoSeed';

// getCol takes a request to decide the sandbox prefix; a bare object means
// "not a sandbox user", i.e. the normal collections for this environment.
const REQ = {};
const col = (name) => getCol(name, REQ);

if (isProduction() && !FORCE) {
    console.error(`\nRefusing to seed demo data into PRODUCTION.`);
    console.error(`Demo drivers would show up in real attendance and payroll totals.`);
    console.error(`Run with APP_ENV=local (default), or pass --force if you really mean it.\n`);
    process.exit(1);
}

// ── Cast ─────────────────────────────────────────────────────────────────────
const DRIVERS = [
    { key: 'ram',    name: 'Ramkumar Yadav', vehicleNo: 'HR55 AB 1234' },
    { key: 'suresh', name: 'Suresh Kumar',   vehicleNo: 'HR55 CD 5678' },
    { key: 'vijay',  name: 'Vijay Singh',    vehicleNo: 'HR55 EF 9012' },
    // No truck of his own — only ever drives when someone else is off.
    { key: 'relief', name: 'Balbir Singh',   vehicleNo: '' },
];

const STAFF = [
    { key: 'mukesh', name: 'Mukesh Sharma', department: 'Office',      fixedSalary: 31000 },
    { key: 'anita',  name: 'Anita Devi',    department: 'Accountant',  fixedSalary: 28000 },
];

/**
 * Trip plan. Deliberately uneven so the roll-call shows every case at once:
 *   - drivers with clear evidence          -> pre-marked present
 *   - a day with no record for a driver    -> left unresolved for the supervisor
 *   - a relief driver on someone else's truck -> credit goes to the relief driver
 *   - a voucher with no driver recorded    -> matched by truck instead
 */
const DAYS = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];

const TRIPS = [
    { date: '2026-07-22', driver: 'ram',    lrNo: 'DEMO-1001' },
    { date: '2026-07-22', driver: 'suresh', lrNo: 'DEMO-1002' },
    { date: '2026-07-23', driver: 'ram',    lrNo: 'DEMO-1003' },
    { date: '2026-07-23', driver: 'suresh', lrNo: 'DEMO-1004' },
    { date: '2026-07-24', driver: 'ram',    lrNo: 'DEMO-1005' },
    // 25th: Ram is off, Balbir takes his truck. Credit must follow the person.
    { date: '2026-07-25', driver: 'relief', lrNo: 'DEMO-1006', truckOf: 'ram' },
    { date: '2026-07-25', driver: 'suresh', lrNo: 'DEMO-1007' },
    { date: '2026-07-26', driver: 'ram',    lrNo: 'DEMO-1008' },
    { date: '2026-07-26', driver: 'suresh', lrNo: 'DEMO-1009' },
    { date: '2026-07-27', driver: 'ram',    lrNo: 'DEMO-1010' },
    // Nobody recorded on the voucher — must be matched via Vijay's truck number.
    { date: '2026-07-27', driver: null,     lrNo: 'DEMO-1011', truckOf: 'vijay' },
];

// Vijay fuels up on the 24th; the fuel log alone should mark him present.
const FUEL = [{ date: '2026-07-24', truckOf: 'vijay' }];

// ── Storage helpers, so the script works with or without Firestore ───────────
const insert = async (name, data) => {
    if (isAvailable()) {
        const ref = await db.collection(col(name)).add({
            ...data, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return ref.id;
    }
    return localStore.insert(name, data).id;
};

const findDemo = async (name) => {
    if (isAvailable()) {
        const snap = await db.collection(col(name)).where(TAG, '==', true).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    return localStore.getAll(name).filter(d => d[TAG]);
};

const remove = async (name, id) => {
    if (isAvailable()) await db.collection(col(name)).doc(id).delete();
    else localStore.delete(name, id);
};

// ── Run ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`\nEnvironment : ${ENV}  (collection prefix "${getEnvPrefix() || 'none — PRODUCTION'}")`);
    console.log(`Database    : ${isAvailable() ? 'Firestore' : 'local JSON store'}`);
    console.log(`Organisation: ${ORG}\n`);

    if (CLEAN) {
        let total = 0;
        for (const name of ['profiles', 'vouchers', 'fuel_logs', 'attendance']) {
            const docs = await findDemo(name);
            for (const d of docs) await remove(name, d.id);
            console.log(`  removed ${String(docs.length).padStart(3)} from ${col(name)}`);
            total += docs.length;
        }
        console.log(`\nRemoved ${total} demo documents.\n`);
        process.exit(0);
    }

    // Refuse to stack a second copy on top of the first.
    const existing = await findDemo('profiles');
    if (existing.length) {
        console.error(`${existing.length} demo profiles already exist. Run with --clean first.\n`);
        process.exit(1);
    }

    const ids = {};

    for (const d of DRIVERS) {
        ids[d.key] = await insert('profiles', {
            [TAG]: true, orgId: ORG,
            type: 'Driver', department: 'Driver',
            name: d.name, vehicleNo: d.vehicleNo, vehicleType: 'Trailer',
            mobileNumbers: [''], bankDetails: [{ bankName: '', accountNo: '', ifsc: '' }],
            fixedSalary: 30000, paidLeaveEntitlement: 2,
            dateJoined: '2026-01-01', dateExit: '',
        });
        console.log(`  driver  ${d.name}${d.vehicleNo ? ` — ${d.vehicleNo}` : ' — no fixed truck'}`);
    }

    for (const s of STAFF) {
        ids[s.key] = await insert('profiles', {
            [TAG]: true, orgId: ORG,
            type: 'Office Staff', department: s.department,
            name: s.name, vehicleNo: '',
            mobileNumbers: [''], bankDetails: [{ bankName: '', accountNo: '', ifsc: '' }],
            fixedSalary: s.fixedSalary, paidLeaveEntitlement: 2,
            dateJoined: '2026-01-01', dateExit: '',
        });
        console.log(`  staff   ${s.name} — ${s.department}`);
    }

    const truckFor = (key) => DRIVERS.find(d => d.key === key)?.vehicleNo || '';

    for (const t of TRIPS) {
        const driver = t.driver ? DRIVERS.find(d => d.key === t.driver) : null;
        const truck = truckFor(t.truckOf || t.driver);
        await insert('vouchers', {
            [TAG]: true, orgId: ORG,
            type: 'JK_Super', date: t.date, lrNo: t.lrNo, truckNo: truck,
            // Left blank on purpose for the "nobody recorded" case.
            driverId: driver ? ids[driver.key] : '',
            driverName: driver ? driver.name : '',
            destination: 'Demo Site', partyName: 'DEMO PARTY',
            weight: '25', rate: '100',
        });
    }
    console.log(`\n  ${TRIPS.length} vouchers across ${DAYS.length} days`);

    for (const f of FUEL) {
        await insert('fuel_logs', {
            [TAG]: true, orgId: ORG,
            date: f.date, truckNo: truckFor(f.truckOf), litres: 120, amount: 11000,
        });
    }
    console.log(`  ${FUEL.length} fuel log\n`);

    console.log('Done. Open Attendance and step through 22–27 July 2026.');
    console.log('Remove it again with: node server/scripts/seedAttendanceDemo.js --clean\n');
    process.exit(0);
})().catch(err => {
    console.error('\nSeed failed:', err && err.stack ? err.stack : err, '\n');
    process.exit(1);
});
