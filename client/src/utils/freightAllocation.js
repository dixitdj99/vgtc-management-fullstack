/**
 * freightAllocation.js — spreading one freight payment across a truck's trips.
 *
 * A payable in the Pay module is a truck, and a truck's dues can span several
 * trips and more than one module. When the clerk pays less than the full
 * outstanding, something has to decide which trips that money settles. It
 * settles the oldest first: that is how the office already reconciles on paper,
 * and it keeps the ageing on the balance sheet honest instead of leaving a
 * scatter of half-paid trips behind.
 *
 * `paymentClearedDate` is set ONLY on a trip the payment fully settles. Marking
 * a part-paid trip as cleared would show it as done on the balance sheet while
 * money was still owed on it.
 *
 * Pure on purpose — this is the code that moves money, so it is the code worth
 * testing. It returns the patches to apply rather than applying them.
 */

/**
 * @param {object[]} vouchers  the payable's trips
 * @param {object}   o
 * @param {number}   o.amount        rupees being paid now
 * @param {string}   o.paymentDate   YYYY-MM-DD
 * @param {string}   o.paymentMethod
 * @param {function} o.netOf         (voucher) => net payable for that trip
 * @returns {{patches: {id: string, paidBalance: string, paymentClearedDate?: string,
 *           paymentMethod?: string}[], allocated: number, unallocated: number}}
 */
export function allocateFreightPayment(vouchers, { amount, paymentDate, paymentMethod, netOf }) {
    let remaining = Math.max(0, Number(amount) || 0);
    const patches = [];

    // Oldest trip first. lrNo breaks ties so two trips on one date always settle
    // in the same order — otherwise the same part-payment could land differently
    // depending on how the list happened to be sorted upstream.
    const ordered = [...vouchers].sort((a, b) => {
        const da = a.date || '', db = b.date || '';
        if (da !== db) return da < db ? -1 : 1;
        return (Number(a.lrNo) || 0) - (Number(b.lrNo) || 0);
    });

    for (const v of ordered) {
        if (remaining <= 0) break;

        const already = parseFloat(v.paidBalance) || 0;
        const due = round2(netOf(v) - already);
        if (due <= 0) continue;              // already settled, or a credit note

        const take = Math.min(remaining, due);
        const settled = round2(take) >= due;

        patches.push({
            id: v.id,
            paidBalance: String(round2(already + take).toFixed(2)),
            ...(settled ? { paymentClearedDate: paymentDate, paymentMethod } : {}),
        });

        remaining = round2(remaining - take);
    }

    return {
        patches,
        allocated: round2((Number(amount) || 0) - remaining),
        // Money the clerk entered that no trip could absorb — an overpayment.
        // Returned rather than silently swallowed so the caller can refuse it.
        unallocated: remaining,
    };
}

/** Total still owed on a payable. */
export function outstandingOf(vouchers, netOf) {
    return round2(vouchers.reduce(
        (s, v) => s + Math.max(0, netOf(v) - (parseFloat(v.paidBalance) || 0)),
        0,
    ));
}

// Rupee arithmetic in floating point drifts (0.1 + 0.2), and a drift of a
// fraction of a paisa is enough to leave a trip looking unsettled forever.
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
