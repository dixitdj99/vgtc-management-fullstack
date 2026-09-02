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
        const numA = Number(String(a.lrNo || 0).split(',')[0].trim()) || 0;
        const numB = Number(String(b.lrNo || 0).split(',')[0].trim()) || 0;
        return numA - numB;
    });

    for (const v of ordered) {
        if (remaining <= 0 && Number(amount) > 0) break;

        const already = parseFloat(v.paidBalance) || 0;
        const due = round2(netOf(v) - already);
        if (due <= 0) {
            if (!v.paymentClearedDate) {
                patches.push({
                    id: v._parentId || v.id,
                    paidBalance: String(already),
                    paymentClearedDate: paymentDate,
                    paymentMethod,
                });
            }
            continue;
        }

        const take = Math.min(remaining, due);
        const settled = round2(take) >= due;

        patches.push({
            id: v._parentId || v.id,
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

/**
 * The same payment spread across several trucks — one owner settled in one go.
 *
 * Each truck is allocated on its own, because "oldest first" has to be answered
 * within a truck: pooling an owner's trips would let one truck's arrears
 * swallow money the clerk meant for another, and a trip's net depends on the
 * vehicle it ran on (the market-vehicle GPS rule docks Rs.50 on a JK Lakshmi
 * trip), so there is no single `netOf` for the whole fleet.
 *
 * Trucks are filled in the order given, each up to what it owes, until the
 * money runs out. A full payment therefore settles everything; a part payment
 * clears whole trucks from the front rather than leaving every truck half paid.
 *
 * @param {object[]} vouchers   every trip being settled, across all the trucks
 * @param {object}   o
 * @param {number}   o.amount        rupees being paid now
 * @param {string}   o.paymentDate   YYYY-MM-DD
 * @param {string}   o.paymentMethod
 * @param {string[]} o.trucks        truck numbers, in the order to fill them
 * @param {function} o.netOfTruck    (truckNo) => (voucher) => net payable
 * @returns {{patches: object[], allocated: number, unallocated: number}}
 */
export function allocateAcrossTrucks(vouchers, { amount, paymentDate, paymentMethod, trucks, netOfTruck }) {
    const patches = [];
    let left = round2(Number(amount) || 0);

    for (const truck of trucks) {
        if (left <= 0) break;
        const trips = vouchers.filter(v => v.truckNo === truck);
        if (!trips.length) continue;

        const netOf = netOfTruck(truck);
        const owed = outstandingOf(trips, netOf);
        if (owed <= 0) continue;

        const give = Math.min(left, owed);
        const res = allocateFreightPayment(trips, { amount: give, paymentDate, paymentMethod, netOf });
        patches.push(...res.patches);
        left = round2(left - res.allocated);
    }

    return {
        patches,
        allocated: round2((Number(amount) || 0) - left),
        unallocated: Math.max(0, left),
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
