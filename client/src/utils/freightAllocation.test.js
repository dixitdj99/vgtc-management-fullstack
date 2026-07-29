/**
 * Run: node client/src/utils/freightAllocation.test.js
 *
 * Plain node — client/package.json is type:module, so no runner is needed. This
 * covers the code that decides which trips a part-payment settles, which is the
 * only place in the freight flow where money moves without a human checking it.
 */
import { allocateFreightPayment, outstandingOf } from './freightAllocation.js';

let passed = 0, failed = 0;

function check(label, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; console.log(`ok    ${label}`); }
    else { failed++; console.log(`FAIL  ${label}\n        expected ${e}\n        actual   ${a}`); }
}

// Net = gross for these fixtures; the real netOf is calcNet from voucherCalc.
const netOf = v => v.net;
const pay = (vouchers, amount) => allocateFreightPayment(vouchers, {
    amount, paymentDate: '2026-08-05', paymentMethod: 'Cash', netOf,
});

const trip = (id, date, net, paidBalance = '', lrNo = 0) => ({ id, date, net, paidBalance, lrNo });

// ── Full settlement ─────────────────────────────────────────────────────────
{
    const v = [trip('a', '2026-07-01', 1000), trip('b', '2026-07-02', 500)];
    const r = pay(v, 1500);
    check('full payment settles every trip', r.patches, [
        { id: 'a', paidBalance: '1000.00', paymentClearedDate: '2026-08-05', paymentMethod: 'Cash' },
        { id: 'b', paidBalance: '500.00', paymentClearedDate: '2026-08-05', paymentMethod: 'Cash' },
    ]);
    check('full payment leaves nothing unallocated', [r.allocated, r.unallocated], [1500, 0]);
}

// ── Partial across two trips, oldest first ──────────────────────────────────
{
    const v = [trip('b', '2026-07-02', 500), trip('a', '2026-07-01', 1000)];
    const r = pay(v, 1200);
    check('oldest trip clears first, newer is part-paid', r.patches, [
        { id: 'a', paidBalance: '1000.00', paymentClearedDate: '2026-08-05', paymentMethod: 'Cash' },
        { id: 'b', paidBalance: '200.00' },
    ]);
}

// ── A part-paid trip must not look cleared ──────────────────────────────────
{
    const r = pay([trip('a', '2026-07-01', 1000)], 400);
    check('part-paid trip carries no cleared date', r.patches, [{ id: 'a', paidBalance: '400.00' }]);
}

// ── Topping a part-paid trip up to full ─────────────────────────────────────
{
    const r = pay([trip('a', '2026-07-01', 1000, '400')], 600);
    check('topping up a part-paid trip clears it', r.patches, [
        { id: 'a', paidBalance: '1000.00', paymentClearedDate: '2026-08-05', paymentMethod: 'Cash' },
    ]);
}

// ── Overpayment is reported, not absorbed ───────────────────────────────────
{
    const r = pay([trip('a', '2026-07-01', 1000)], 1500);
    check('overpayment does not inflate paidBalance', r.patches, [
        { id: 'a', paidBalance: '1000.00', paymentClearedDate: '2026-08-05', paymentMethod: 'Cash' },
    ]);
    check('overpayment is returned as unallocated', [r.allocated, r.unallocated], [1000, 500]);
}

// ── Settled and credit-note trips are skipped ───────────────────────────────
{
    const v = [trip('done', '2026-07-01', 1000, '1000'), trip('credit', '2026-07-02', -200), trip('open', '2026-07-03', 300)];
    const r = pay(v, 300);
    check('already-settled and negative trips are left alone', r.patches, [
        { id: 'open', paidBalance: '300.00', paymentClearedDate: '2026-08-05', paymentMethod: 'Cash' },
    ]);
}

// ── Same-date trips settle by LR number, not array order ────────────────────
{
    const v = [trip('second', '2026-07-01', 100, '', 12), trip('first', '2026-07-01', 100, '', 7)];
    check('same-date trips settle in LR order', pay(v, 100).patches, [
        { id: 'first', paidBalance: '100.00', paymentClearedDate: '2026-08-05', paymentMethod: 'Cash' },
    ]);
}

// ── Rupee arithmetic must not drift ─────────────────────────────────────────
{
    const v = [trip('a', '2026-07-01', 0.1), trip('b', '2026-07-02', 0.2)];
    const r = pay(v, 0.3);
    check('float drift does not leave a trip a fraction short', r.patches.length, 2);
    check('both trips clear on an exact 0.30', r.patches.every(p => p.paymentClearedDate), true);
    check('nothing left over after 0.1 + 0.2', r.unallocated, 0);
}

// ── Zero payment is a no-op ─────────────────────────────────────────────────
{
    check('paying nothing patches nothing', pay([trip('a', '2026-07-01', 1000)], 0).patches, []);
}

// ── outstandingOf ───────────────────────────────────────────────────────────
{
    const v = [trip('a', '2026-07-01', 1000, '400'), trip('b', '2026-07-02', 500), trip('c', '2026-07-03', 100, '100')];
    check('outstanding sums only what is still owed', outstandingOf(v, netOf), 1100);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
