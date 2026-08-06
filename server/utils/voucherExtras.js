/**
 * voucherExtras.js — server-side reader for a voucher's "extra money" lines.
 *
 * Mirrors the read half of client/src/utils/voucherExtras.js. Only the client
 * writes vouchers, so there is no payload builder here; the PDF just needs to
 * print each extra on its own line instead of cramming every remark into one.
 *
 * `extraCash` stays the authoritative total, so the net math above this is
 * untouched — see the client helper for why.
 */

const num = (x) => parseFloat(x) || 0;

/** @returns {{amount: number, remark: string}[]} extras with money on them */
function printableExtras(v = {}) {
  const list = Array.isArray(v.extras) && v.extras.length
    ? v.extras
    : [{ amount: v.extraCash, remark: v.extraCashRemark }];
  return list
    .map(e => ({ amount: num(e?.amount), remark: String(e?.remark || '').trim() }))
    .filter(e => e.amount > 0);
}

module.exports = { printableExtras };
