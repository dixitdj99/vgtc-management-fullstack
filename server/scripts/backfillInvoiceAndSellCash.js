/**
 * backfillInvoiceAndSellCash.js — make the invoice↔balance-sheet link and the
 * Sell cash box correct against data that predates them.
 *
 *   node server/scripts/backfillInvoiceAndSellCash.js                    # dry run
 *   node server/scripts/backfillInvoiceAndSellCash.js --apply            # writes
 *   node server/scripts/backfillInvoiceAndSellCash.js --apply --cash-dump=12000 --cash-jkl=0
 *
 * Runs against whichever tier APP_ENV selects, so check the banner it prints
 * before using --apply. Both steps are idempotent: running twice changes
 * nothing the second time.
 *
 * ── Step 1: invoices → vouchers ─────────────────────────────────────────────
 * Generating a bill now marks each billed LR on its voucher, and refuses an LR
 * already marked. Invoices raised before that shipped left no mark, so the
 * server would happily bill them a second time (only the upload screen's
 * client-side filter stands in the way). This walks existing invoices and:
 *   - writes `lrNos` on the invoice doc, which the duplicate-LR guard queries
 *   - marks each matched voucher's `invoicedLrNos` / `invoiceGenerated`
 *
 * ── Step 2: Sell cash opening balance ───────────────────────────────────────
 * "Cash in hand" is every paid cash sale minus recorded movements. The
 * movements collection is new, so on first run it counts cash banked months ago
 * through the old free-form transfer — the figure starts far too high and the
 * deposit cap lets money out that is not there.
 *
 * This writes one opening adjustment per brand to bring the figure to the cash
 * actually in the box (0 unless you pass --cash-<brand>=<amount>). It is a
 * 'withdrawal' rather than a fabricated sale so it can never be mistaken for
 * revenue, and it is skipped entirely if any movement already exists.
 */

require('dotenv').config();

const { isAvailable } = require('../firebase');
const { ENV, getEnvPrefix } = require('../utils/envConfig');
const voucherService = require('../services/voucherService');
const sellService = require('../utils/sellService');
const {
    buildVoucherLrIndex, findVoucherForLr, scopeVouchersToPlant,
    isLrInvoicedOnVoucher, entriesAfterMark, lrStrip,
} = require('../utils/invoiceLinking');

const APPLY = process.argv.includes('--apply');
const ORG_ID = process.env.BACKFILL_ORG_ID || 'vgtc';
const PREFIX = getEnvPrefix();
const col = (base) => `${PREFIX}${base}`;

const argNum = (name) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    if (!hit) return null;
    const n = parseFloat(hit.split('=')[1]);
    return Number.isFinite(n) ? n : null;
};

const rs = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

async function backfillInvoices({ db, admin }) {
    console.log('\n── Step 1: invoices → vouchers ───────────────────────────────');

    const invSnap = await db.collection(col('invoices')).get();
    const invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!invoices.length) { console.log('  no invoices on record — nothing to link'); return; }

    const vouchers = await voucherService.getAllVouchers(ORG_ID, col('vouchers'));
    console.log(`  ${invoices.length} invoice(s), ${vouchers.length} voucher(s)`);

    // voucherId -> { voucher, lrNos, billNo, billDate }; one write per voucher
    // even when several bills touch it.
    const pending = new Map();
    let lrNosWrites = 0, alreadyMarked = 0, unmatched = 0;
    const unmatchedSamples = [];

    for (const inv of invoices) {
        const items = inv.items || [];
        const lrNos = items.map(it => String(it.lrNo || '').trim()).filter(Boolean);
        if (!Array.isArray(inv.lrNos) && lrNos.length) lrNosWrites++;

        const index = buildVoucherLrIndex(scopeVouchersToPlant(vouchers, inv.plantKey));
        for (const it of items) {
            if (!String(it.lrNo || '').trim()) continue;
            const v = findVoucherForLr(index, it.lrNo);
            if (!v) {
                unmatched++;
                if (unmatchedSamples.length < 8) unmatchedSamples.push(`${it.lrNo} (bill #${inv.billNo})`);
                continue;
            }
            if (isLrInvoicedOnVoucher(v, it.lrNo)) { alreadyMarked++; continue; }

            const slot = pending.get(v.id) || { voucher: v, lrNos: [], billNo: inv.billNo, billDate: inv.billDate };
            slot.lrNos.push(it.lrNo);
            pending.set(v.id, slot);
        }
    }

    console.log(`  invoice docs needing lrNos: ${lrNosWrites}`);
    console.log(`  vouchers to mark:           ${pending.size}`);
    console.log(`  LRs already marked:         ${alreadyMarked}`);
    console.log(`  LRs with no voucher:        ${unmatched}${unmatchedSamples.length ? ' e.g. ' + unmatchedSamples.join(', ') : ''}`);
    if (unmatched) {
        console.log('    ↑ these were billed without a balance-sheet entry. They stay unmarked,');
        console.log('      which is honest — there is nothing to mark. Add the vouchers if they matter.');
    }

    if (!APPLY) return;

    for (const inv of invoices) {
        const lrNos = (inv.items || []).map(it => String(it.lrNo || '').trim()).filter(Boolean);
        if (!Array.isArray(inv.lrNos) && lrNos.length) {
            await db.collection(col('invoices')).doc(inv.id).update({ lrNos });
        }
    }
    for (const { voucher, lrNos, billNo, billDate } of pending.values()) {
        const entries = entriesAfterMark(voucher, lrNos, billNo);
        await voucherService.updateVoucher(voucher.id, {
            invoicedLrNos: entries,
            invoiceGenerated: entries.length > 0,
            invoiceBillNo: String(billNo),
            invoiceDate: billDate || '',
        }, col('vouchers'));
    }
    console.log(`  applied: ${lrNosWrites} invoice doc(s), ${pending.size} voucher(s) marked`);
}

async function backfillSellCash() {
    console.log('\n── Step 2: Sell cash opening balance ─────────────────────────');

    for (const brand of ['dump', 'jkl']) {
        const target = argNum(`cash-${brand}`) ?? 0;
        const existing = await sellService.getMovements(ORG_ID, brand, col('sell_cash_movements'));
        if (existing.length) {
            console.log(`  ${brand.padEnd(5)} — ${existing.length} movement(s) already recorded, skipping`);
            continue;
        }

        const computed = await sellService.getCashInHand(ORG_ID, brand, col('sales'), col('sell_cash_movements'));
        const adjust = Math.round((computed - target) * 100) / 100;

        if (adjust <= 0) {
            console.log(`  ${brand.padEnd(5)} — computed ${rs(computed)}, target ${rs(target)} → no adjustment needed`);
            continue;
        }

        console.log(`  ${brand.padEnd(5)} — computed ${rs(computed)} from past cash sales, target ${rs(target)}`);
        console.log(`          → opening adjustment of ${rs(adjust)} (cash already banked before this feature)`);

        if (!APPLY) continue;
        await sellService.addMovement(ORG_ID, {
            type: 'withdrawal',
            amount: adjust,
            brand,
            date: new Date().toISOString().slice(0, 10),
            remark: 'Opening adjustment — cash collected before cash tracking started (already banked)',
            createdBy: 'backfill script',
        }, col('sales'), col('sell_cash_movements'));

        const after = await sellService.getCashInHand(ORG_ID, brand, col('sales'), col('sell_cash_movements'));
        console.log(`          applied. Cash in hand is now ${rs(after)}`);
    }
}

(async () => {
    if (!isAvailable()) {
        console.error('Firestore is not available — refusing to run against the local JSON fallback.');
        process.exit(1);
    }
    const { db, admin } = require('../firebase');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Backfill — environment "${ENV}", collection prefix "${PREFIX || '(none — PRODUCTION)'}"`);
    console.log(`  org: ${ORG_ID}   mode: ${APPLY ? '*** APPLY (writes) ***' : 'dry run (no writes)'}`);
    console.log('═══════════════════════════════════════════════════════════════');

    try {
        await backfillInvoices({ db, admin });
        await backfillSellCash();
        console.log(APPLY ? '\nDone — changes written.' : '\nDry run complete. Re-run with --apply to write.');
        process.exit(0);
    } catch (e) {
        console.error('\nFailed:', e.message);
        console.error(e.stack);
        process.exit(1);
    }
})();
