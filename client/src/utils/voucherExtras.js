/**
 * voucherExtras.js — the "extra money" lines on a voucher.
 *
 * A voucher used to carry one `extraCash` amount and one `extraCashRemark`, but a
 * trip rarely has just one: grease at one dhaba, a tip for the puncture wallah at
 * the next. Those now live in `extras: [{ amount, remark }]`.
 *
 * `extraCash` and `extraCashRemark` are still written on every save, as the total
 * and the joined remarks. A dozen other places — Balance Sheet, Pay, Trip Profit,
 * Truck Dashboard, the sheets export, the PDF — work out what is owed from those
 * two fields, and none of them need to learn that the money arrived in pieces.
 * Keeping the pair authoritative is what makes this a small change instead of a
 * sweep through every net calculation in the app.
 *
 * The one rule: never write `extraCash` without `extras`. Use extrasPayload().
 */

const num = (x) => parseFloat(x) || 0;

/**
 * The extra lines on a voucher. Records written before this existed carry a
 * single amount, so they read back as a one-line list.
 * @returns {{amount: string|number, remark: string}[]}
 */
export function readExtras(v = {}) {
  if (Array.isArray(v.extras) && v.extras.length) {
    return v.extras.map(e => ({ amount: e?.amount ?? '', remark: e?.remark || '' }));
  }
  if (num(v.extraCash) > 0 || String(v.extraCashRemark || '').trim()) {
    return [{ amount: v.extraCash ?? '', remark: v.extraCashRemark || '' }];
  }
  return [];
}

export const extrasTotal = (list = []) => list.reduce((s, e) => s + num(e?.amount), 0);

/** Drops the blank rows an open-ended form always leaves behind. */
export const cleanExtras = (list = []) =>
  list
    .map(e => ({ amount: num(e?.amount), remark: String(e?.remark || '').trim() }))
    .filter(e => e.amount > 0 || e.remark);

/**
 * The three fields to save. Always returns all three so the legacy pair cannot
 * drift from the list — including back to empty when the last line is removed.
 */
export function extrasPayload(list = []) {
  const extras = cleanExtras(list);
  return {
    extras,
    extraCash: extrasTotal(extras) || '',
    extraCashRemark: extras.map(e => e.remark).filter(Boolean).join('; '),
  };
}

/** Rows worth printing: an amount is what the driver is charged, a bare remark is not. */
export const printableExtras = (v = {}) =>
  cleanExtras(readExtras(v)).filter(e => e.amount > 0);
