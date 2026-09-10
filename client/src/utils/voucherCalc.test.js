/**
 * voucherCalc.test.js
 *
 * Run: node --input-type=module client/src/utils/voucherCalc.test.js
 *       (from the project root, or drop the "client/src/utils/" prefix when
 *        you are already in that directory)
 *
 * Why these tests exist
 * ─────────────────────
 * calcNet is the single formula that every balance sheet, every payment
 * settlement, and every freight batch total derives from. A one-character
 * typo — reading v.diesel instead of v.advanceDiesel, for example — used
 * to make diesel silently total zero across thousands of trips. None of
 * those bugs announced themselves. These tests make the next one loud.
 *
 * Plain node, no runner, no bundler. Run it in CI or locally before any
 * deploy that touches VoucherModule, BalanceSheet, or voucherCalc itself.
 */

import { calcNet, calcOutstanding, checkExpiry } from './voucherCalc.js';

let passed = 0, failed = 0;

function check(label, actual, expected) {
    // Compare as JSON so numeric 0 !== undefined, etc.
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        passed++;
        console.log(`ok    ${label}`);
    } else {
        failed++;
        console.log(`FAIL  ${label}`);
        console.log(`        expected ${e}`);
        console.log(`        actual   ${a}`);
    }
}

// Shorthand: build a minimal voucher with sensible defaults so each test only
// needs to specify the field it cares about.
//
// IMPORTANT: parseFloat('0') is falsy, so `munshi: '0'` still triggers the
// auto-munshi rule (weight > 0 → 50 or 100). Use explicit munshi when the
// test is about something other than munshi.  The helper default keeps weight
// and rate at '0' so the gross is 0 and auto-munshi is also 0 unless weight
// is overridden.
const v = (overrides = {}) => ({
    weight: '0', rate: '0',
    advanceDiesel: '0', advanceCash: '0', advanceOnline: '0',
    munshi: '0', commission: '0', shortage: '0',
    tyrePuncture: '0', tyreGreasing: '0', tyreAir: '0', tyreGreasingAir: '0',
    extraCash: '0',
    ...overrides,
});

// Helper for tests that need a non-zero gross without worrying about munshi.
// Uses weight=20 so auto-munshi is ₹100 which we know and can subtract.
// Or just pass an explicit munshi. This alias is clearer in the test itself.
const vNet = (overrides = {}) => v({ weight: '10', rate: '500', munshi: '50', ...overrides });


// ── Basic gross calculation ─────────────────────────────────────────────────

check('basic gross: weight × rate',
    calcNet(vNet()),  // weight=10, rate=500, munshi=50 → 5000 − 50 = 4950
    4950);

check('gross rounds correctly with decimals',
    calcNet(v({ weight: '10.5', rate: '200', munshi: '50' })),
    10.5 * 200 - 50); // 2100 - 50 = 2050

check('zero weight gives zero gross, zero munshi',
    calcNet(v({ weight: '0', rate: '500' })),
    0);

// ── Multi-delivery (deliveries array overrides weight × rate) ───────────────

check('multi-delivery gross sums each drop',
    calcNet(v({
        weight: '99', rate: '99', // these must be ignored when deliveries present
        munshi: '100',            // explicit munshi so auto-munshi doesn't fire on weight=99
        deliveries: [
            { weight: '6', rate: '420' },
            { weight: '4', rate: '500' },
        ],
    })),
    6 * 420 + 4 * 500 - 100); // gross=4520, munshi=100 → 4420

check('empty deliveries array falls back to weight × rate',
    calcNet(v({ weight: '10', rate: '500', munshi: '50', deliveries: [] })),
    4950); // 5000 − 50 munshi

// ── advanceDiesel ───────────────────────────────────────────────────────────
// This is the field that was once silently misread as v.diesel → always 0.

check('advanceDiesel number is deducted',
    calcNet(vNet({ advanceDiesel: '2000' })),
    5000 - 50 - 2000); // gross=5000, munshi=50, diesel=2000 → 2950

check('advanceDiesel = FULL deducts the 4000 estimate',
    calcNet(vNet({ advanceDiesel: 'FULL' })),
    5000 - 50 - 4000); // gross=5000, munshi=50, diesel=4000 → 950

// The check is strict (=== 'FULL'). Lowercase 'full' is treated as NaN → 0.
// This test documents the current behaviour so a future change to case-insensitive
// matching is visible at a glance.
check('advanceDiesel = "full" (lowercase) is NOT treated as FULL — it becomes 0',
    calcNet(vNet({ advanceDiesel: 'full' })),
    5000 - 50); // only munshi deducted; 'full' parses as 0

check('advanceDiesel blank string treated as 0',
    calcNet(vNet({ advanceDiesel: '' })),
    5000 - 50); // blank → 0 diesel, munshi=50

// ── Cash / online advance ───────────────────────────────────────────────────

check('advanceCash is deducted',
    calcNet(vNet({ advanceCash: '1000' })),
    5000 - 50 - 1000); // 3950

check('advanceOnline is deducted',
    calcNet(vNet({ advanceOnline: '500' })),
    5000 - 50 - 500); // 4450

check('all three advances deducted together',
    calcNet(vNet({ advanceDiesel: '1000', advanceCash: '500', advanceOnline: '200' })),
    5000 - 50 - 1000 - 500 - 200); // munshi=50, total=2250

// ── Munshi ──────────────────────────────────────────────────────────────────
// Default munshi: 0 when weight is 0, ₹50 for < 18 MT, ₹100 for ≥ 18 MT.
// An explicit munshi field always wins.

check('weight < 18 → auto munshi ₹50',
    calcNet(v({ weight: '17', rate: '500', munshi: '0' })),
    17 * 500 - 50); // 8450

check('weight = 18 → auto munshi ₹100',
    calcNet(v({ weight: '18', rate: '500', munshi: '0' })),
    18 * 500 - 100); // 8900

check('weight = 25 → auto munshi ₹100',
    calcNet(v({ weight: '25', rate: '500', munshi: '0' })),
    25 * 500 - 100); // 12400

check('explicit munshi overrides the auto rule',
    calcNet(v({ weight: '25', rate: '500', munshi: '150' })),
    25 * 500 - 150); // 12350

check('weight = 0 → no auto munshi',
    calcNet(v({ weight: '0', rate: '500', munshi: '0' })),
    0);

// ── Commission, shortage, tyre costs ────────────────────────────────────────

check('commission deducted',
    calcNet(v({ weight: '10', rate: '500', commission: '200' })),
    5000 - 50 - 200); // munshi auto = 50 (10 < 18), commission = 200 → 4750

check('shortage deducted',
    calcNet(v({ weight: '10', rate: '500', shortage: '100', munshi: '50' })),
    5000 - 50 - 100); // 4850

check('tyrePuncture deducted',
    calcNet(v({ weight: '10', rate: '500', tyrePuncture: '300', munshi: '50' })),
    5000 - 50 - 300); // 4650

check('tyreGreasing and tyreAir summed and deducted',
    calcNet(v({ weight: '10', rate: '500', tyreGreasing: '100', tyreAir: '50', munshi: '50' })),
    5000 - 50 - 100 - 50); // 4800

check('tyreGreasingAir field (legacy combined) deducted',
    calcNet(v({ weight: '10', rate: '500', tyreGreasingAir: '75', munshi: '50' })),
    5000 - 50 - 75); // 4875

check('all tyre fields sum correctly',
    calcNet(v({ weight: '10', rate: '500', tyrePuncture: '100', tyreGreasing: '50', tyreAir: '25', tyreGreasingAir: '25', munshi: '50' })),
    5000 - 50 - 100 - 50 - 25 - 25); // 4750

check('extraCash deducted',
    calcNet(v({ weight: '10', rate: '500', extraCash: '200', munshi: '50' })),
    5000 - 50 - 200); // 4750

// ── Market truck + no GPS + JK_Lakshmi = ₹50 deduction ─────────────────────
// This is the most obscure rule and the most likely to be forgotten.

const ownTruck   = { ownershipType: 'own',    gpsType: 'some_gps' };
const marketNoGps = { ownershipType: 'market', gpsType: 'none'     };
const marketGps   = { ownershipType: 'market', gpsType: 'some_gps' };

check('market + no GPS + JK_Lakshmi → ₹50 deducted',
    calcNet(v({ weight: '10', rate: '500', munshi: '50', type: 'JK_Lakshmi' }), marketNoGps),
    5000 - 50 - 50); // 4900

check('own truck → no ₹50 deduction',
    calcNet(v({ weight: '10', rate: '500', munshi: '50', type: 'JK_Lakshmi' }), ownTruck),
    5000 - 50); // 4950

check('market + GPS → no ₹50 deduction',
    calcNet(v({ weight: '10', rate: '500', munshi: '50', type: 'JK_Lakshmi' }), marketGps),
    5000 - 50); // 4950

check('market + no GPS + Dump type → no ₹50 deduction (only JK_Lakshmi)',
    calcNet(v({ weight: '10', rate: '500', munshi: '50', type: 'Dump' }), marketNoGps),
    5000 - 50); // 4950

check('vehicle = undefined → no crash, no ₹50 deduction',
    calcNet(v({ weight: '10', rate: '500', munshi: '50', type: 'JK_Lakshmi' }), undefined),
    5000 - 50); // 4950

// ── calcOutstanding ─────────────────────────────────────────────────────────

check('outstanding = net when nothing paid',
    calcOutstanding(v({ weight: '10', rate: '500', munshi: '50' })),
    4950);

check('outstanding = net − paidBalance',
    calcOutstanding({ ...v({ weight: '10', rate: '500', munshi: '50' }), paidBalance: '2000' }),
    2950);

check('outstanding is 0 when fully paid (never negative)',
    calcOutstanding({ ...v({ weight: '10', rate: '500', munshi: '50' }), paidBalance: '5000' }),
    0);

check('outstanding is 0 when over-paid (paidBalance > net)',
    calcOutstanding({ ...v({ weight: '10', rate: '500', munshi: '50' }), paidBalance: '9999' }),
    0);

check('outstanding with no paidBalance field treats it as 0',
    calcOutstanding(v({ weight: '10', rate: '500', munshi: '50' })),
    4950);

// ── checkExpiry ─────────────────────────────────────────────────────────────

// Freeze "today" at a known date so tests do not depend on the wall clock.
// We can't mock Date globally in plain ESM, so we use dates relative to now
// and accept ±1 day tolerance in the `days` field.

const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
};

check('null input returns null',           checkExpiry(null),             null);
check('empty string returns null',         checkExpiry(''),               null);
check('garbage string returns null',       checkExpiry('not-a-date'),     null);

const past = checkExpiry(daysFromNow(-10));
check('past date → expired status',        past?.status,                  'expired');
check('past date → positive days',         typeof past?.days === 'number' && past.days >= 0, true);

const soon = checkExpiry(daysFromNow(15));
check('date 15d away → near status',       soon?.status,                  'near');
check('near date → days < 30',             typeof soon?.days === 'number' && soon.days < 30, true);

const future = checkExpiry(daysFromNow(60));
check('date 60d away → ok status',         future?.status,                'ok');
check('ok date → days >= 30',              typeof future?.days === 'number' && future.days >= 30, true);

// ── Floating point safety (the 0.1 + 0.2 problem) ──────────────────────────
// calcNet does plain JS addition. If someone passes 0.1 and 0.2 the result
// is 0.30000000000000004. The function itself doesn't round — that is
// intentional, callers format — but we at least check it doesn't crash.

check('float inputs do not crash',
    typeof calcNet(v({ weight: '0.1', rate: '10', munshi: '0' })) === 'number',
    true);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
