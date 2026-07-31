/**
 * invoiceLinking.js — matching an invoice line to the balance-sheet voucher it
 * was billed from.
 *
 * A client invoice is the final bill built from the balance sheet, so every
 * entry on it has to resolve to exactly one voucher, and that voucher records
 * which of its LRs have been billed. The matching rules are subtle enough that
 * the route and the backfill script must not each carry their own copy — they
 * would drift, and a drifted rule silently marks the wrong voucher.
 *
 * Everything here is pure except `markVoucherLrs`, which takes the collection
 * to write to so callers keep control of tenancy.
 */

const voucherService = require('../services/voucherService');

/**
 * LR numbers appear as "1022/1234" in the plant Excel but as "1234" on
 * balance-sheet vouchers, so both forms are compared.
 */
const lrKeys = (raw) => {
    const s = String(raw || '').trim().toUpperCase();
    if (!s) return [];
    const stripped = s.replace(/.*\//, '').trim();
    return stripped && stripped !== s ? [s, stripped] : [s];
};

/** The canonical key for an LR: the part after the last slash. */
const lrStrip = (raw) => {
    const keys = lrKeys(raw);
    return keys.length ? keys[keys.length - 1] : '';
};

const buildVoucherLrIndex = (vouchers) => {
    const index = new Map();
    vouchers.forEach(v => {
        const lrs = [v.lrNo, ...(v.deliveries || []).map(d => d.lrNo)];
        lrs.forEach(lr => lrKeys(lr).forEach(k => { if (!index.has(k)) index.set(k, v); }));
    });
    return index;
};

const findVoucherForLr = (index, lrNo) => {
    for (const k of lrKeys(lrNo)) {
        const v = index.get(k);
        if (v) return v;
    }
    return null;
};

/**
 * Which balance-sheet voucher types a plant's invoice may bill against. LR
 * serials restart per plant, so matching across all types would let a JK Super
 * bill lock a Kosli voucher that happens to share the number.
 */
const PLANT_VOUCHER_TYPES = {
    jksuper_jharli: ['Dump', 'JK_Super'],
    jklakshmi_jharli: ['JK_Lakshmi'],
    kosli_dump: ['Kosli_Bill'],
    jhajjar_dump: ['Jajjhar_Bill'],
};

const scopeVouchersToPlant = (vouchers, plantKey) => {
    const allowed = PLANT_VOUCHER_TYPES[plantKey];
    return allowed ? vouchers.filter(v => allowed.includes(v.type)) : vouchers;
};

/**
 * Billing is per-LR: one multi-delivery voucher can be spread across bills, so
 * each voucher carries `invoicedLrNos: [{ lr, billNo }]` and `invoiceGenerated`
 * only means "at least one LR billed". The boolean fallback is for vouchers
 * written before the per-LR list existed.
 */
const isLrInvoicedOnVoucher = (v, lrNo) => {
    if (Array.isArray(v.invoicedLrNos)) {
        const key = lrStrip(lrNo);
        return v.invoicedLrNos.some(e => e.lr === key);
    }
    return !!v.invoiceGenerated;
};

/** The `invoicedLrNos` a voucher should hold once these LRs are billed. */
const entriesAfterMark = (voucher, lrNos, billNo) => {
    const entries = Array.isArray(voucher.invoicedLrNos) ? [...voucher.invoicedLrNos] : [];
    lrNos.forEach(lr => {
        const key = lrStrip(lr);
        if (key && !entries.some(e => e.lr === key)) entries.push({ lr: key, billNo: String(billNo) });
    });
    return entries;
};

const markVoucherLrs = async (voucher, lrNos, billNo, billDate, voucherCol) => {
    const entries = entriesAfterMark(voucher, lrNos, billNo);
    await voucherService.updateVoucher(voucher.id, {
        invoicedLrNos: entries,
        invoiceGenerated: entries.length > 0,
        invoiceBillNo: String(billNo),
        invoiceDate: billDate || '',
    }, voucherCol);
};

module.exports = {
    lrKeys, lrStrip, buildVoucherLrIndex, findVoucherForLr,
    PLANT_VOUCHER_TYPES, scopeVouchersToPlant,
    isLrInvoicedOnVoucher, entriesAfterMark, markVoucherLrs,
};
