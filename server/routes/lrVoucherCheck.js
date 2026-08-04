const voucherService = require('../services/voucherService');
const { getCol } = require('../utils/collectionUtils');
const { buildVoucherLrIndex, findVoucherForLr, scopeVouchersToPlant } = require('../utils/invoiceLinking');

/**
 * "Is there already a voucher on this LR number?"
 *
 * The books were not started together. Vouchers have been written for months
 * while the loading receipts are only being entered now, so a clerk typing an
 * LR number is very often typing one a voucher already refers to — and that is
 * usually right, because the receipt is being caught up to a trip that really
 * happened. It is worth saying out loud all the same: it confirms the number
 * is the one they meant, and it catches the case where it is not.
 *
 * Advisory only. It never refuses the receipt — a voucher existing is evidence
 * for the number, not against it. The one thing that does refuse is a receipt
 * already carrying that number, which lrService checks on create.
 *
 * LR serials restart per plant, so the search is scoped to the voucher types
 * that belong to this book. Without that, a Kosli number would match a JK
 * Lakshmi voucher that happens to share it.
 */

/** LR collection -> the plant key invoiceLinking already uses for scoping. */
const PLANT_OF_LR_COLLECTION = {
    kosli_loading_receipts: 'kosli_dump',
    jhajjar_loading_receipts: 'jhajjar_dump',
    jkl_loading_receipts: 'jklakshmi_jharli',
    loading_receipts: 'jksuper_jharli',
    // Bahadurgarh has no invoice plant of its own; its vouchers are the type
    // below, so it is scoped by hand rather than left unscoped.
    bahadurgarh_loading_receipts: null,
};

const BAHADURGARH_TYPES = ['Bahadurgarh_Bill'];

function mountLrVoucherCheck(router, baseCol) {
    router.get('/voucher-for/:lrNo', async (req, res) => {
        try {
            const lrNo = String(req.params.lrNo || '').trim();
            if (!lrNo) return res.status(400).json({ error: 'LR number required' });

            const vouchers = await voucherService.getAllVouchers(req.orgId, getCol('vouchers', req));
            const plantKey = PLANT_OF_LR_COLLECTION[baseCol];
            const scoped = plantKey
                ? scopeVouchersToPlant(vouchers, plantKey)
                : vouchers.filter(v => BAHADURGARH_TYPES.includes(v.type));

            const voucher = findVoucherForLr(buildVoucherLrIndex(scoped), lrNo);

            // Whether a receipt already holds the number is the clerk's other
            // question, and answering both in one round trip keeps the form
            // from firing two requests per keystroke.
            const lrCol = getCol(baseCol, req);
            const { db, isAvailable } = require('../firebase');
            const localStore = require('../utils/localStore');
            const asNumber = parseInt(lrNo, 10);
            let receiptExists = false;
            if (Number.isSafeInteger(asNumber)) {
                receiptExists = isAvailable()
                    ? !(await db.collection(lrCol)
                        .where('orgId', '==', req.orgId).where('lrNo', '==', asNumber).limit(1).get()).empty
                    : localStore.getAll(lrCol).some(r => r.orgId === req.orgId && r.lrNo === asNumber);
            }

            res.json({
                lrNo,
                receiptExists,
                voucher: voucher ? {
                    id: voucher.id,
                    type: voucher.type,
                    truckNo: voucher.truckNo || '',
                    date: voucher.date || '',
                    destination: voucher.destination || '',
                    partyName: voucher.partyName || '',
                } : null,
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
}

module.exports = { mountLrVoucherCheck, PLANT_OF_LR_COLLECTION };
