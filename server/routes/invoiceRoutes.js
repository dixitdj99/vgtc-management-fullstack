const express = require('express');
const router = express.Router();
const { db, admin, isAvailable } = require('../firebase');
const { getEnvCol, getCol: getTenantCol } = require('../utils/collectionUtils');
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const driveService = require('../utils/driveService');
const voucherService = require('../services/voucherService');

router.use(requireAuth, tenancyMiddleware);

const COL_INVOICES = 'invoices';
const COL_PENDING = 'pending_invoice_items';

const getCol = (base) => getEnvCol(base);

// Matching rules live in one place so this router and the backfill script
// cannot drift — a drifted rule silently marks the wrong voucher.
const {
    lrKeys, lrStrip, buildVoucherLrIndex, findVoucherForLr,
    PLANT_VOUCHER_TYPES, scopeVouchersToPlant, isLrInvoicedOnVoucher, markVoucherLrs,
} = require('../utils/invoiceLinking');

// Remove every mark a bill left on the sheet. Keyed by billNo (not LR), so it
// survives voucher LR edits and cross-voucher LR collisions.
const unmarkBillFromVouchers = async (billNo, req) => {
    const voucherCol = getTenantCol('vouchers', req);
    const allVouchers = await voucherService.getAllVouchers(req.orgId, voucherCol);
    const bill = String(billNo);
    for (const v of allVouchers) {
        const entries = Array.isArray(v.invoicedLrNos) ? v.invoicedLrNos : null;
        const hasBill = entries ? entries.some(e => String(e.billNo) === bill)
            : (v.invoiceGenerated && String(v.invoiceBillNo || '') === bill);
        if (!hasBill) continue;
        const remaining = (entries || []).filter(e => String(e.billNo) !== bill);
        await voucherService.updateVoucher(v.id, {
            invoicedLrNos: remaining,
            invoiceGenerated: remaining.length > 0,
            invoiceBillNo: remaining.length > 0 ? String(remaining[remaining.length - 1].billNo) : '',
            invoiceDate: remaining.length > 0 ? (v.invoiceDate || '') : '',
        }, voucherCol);
    }
};

// ── GET /invoices — list all generated invoices ──
router.get('/', async (req, res) => {
    try {
        if (!isAvailable()) return res.json([]);
        const snap = await db.collection(getCol(COL_INVOICES)).get();
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        res.json(list);
    } catch (e) {
        console.error('List invoices failed:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── POST /invoices/check-number — check if bill number already exists ──
router.post('/check-number', async (req, res) => {
    try {
        const { billNo, plantKey } = req.body;
        if (!billNo) return res.json({ exists: false });
        if (!isAvailable()) return res.json({ exists: false });
        const snap = await db.collection(getCol(COL_INVOICES))
            .where('billNo', '==', String(billNo))
            .get();
        const exists = !snap.empty;
        res.json({ exists, count: snap.size });
    } catch (e) {
        res.json({ exists: false });
    }
});

// ── GET /invoices/next-number — get next available bill number ──
router.get('/next-number', async (req, res) => {
    try {
        if (!isAvailable()) return res.json({ nextNo: 1 });
        const snap = await db.collection(getCol(COL_INVOICES)).get();
        let maxNo = 0;
        snap.docs.forEach(d => {
            const n = parseInt(d.data().billNo);
            if (!isNaN(n) && n > maxNo) maxNo = n;
        });
        res.json({ nextNo: maxNo + 1 });
    } catch (e) {
        res.json({ nextNo: 1 });
    }
});

// ── POST /invoices/generate — generate invoice PDF, save to registry ──
router.post('/generate', async (req, res) => {
    try {
        const { billNo, billDate, plantKey, type, items, gstRate, brand } = req.body;
        if (!billNo) return res.status(400).json({ error: 'Bill number required' });
        if (!items || items.length === 0) return res.status(400).json({ error: 'No items' });

        // Plants whose config still has 'TBD' GSTIN/SAP/plant codes cannot produce
        // a legal tax invoice yet — block until their formats are added.
        const { PLANT_CONFIGS } = require('../config/plantConfig');
        const plantCfg = PLANT_CONFIGS[plantKey];
        if (!plantCfg) return res.status(400).json({ error: `Unknown plant: ${plantKey}` });
        if ([plantCfg.consignorGSTIN, plantCfg.sapCode, plantCfg.plantCode].includes('TBD')) {
            return res.status(400).json({ error: `${plantCfg.label} invoice format is not available yet` });
        }

        // The invoice is the final bill built FROM the balance sheet: every
        // entry must have a voucher (of this plant's types) whose LR is not
        // invoiced yet.
        const voucherCol = getTenantCol('vouchers', req);
        const allVouchersRaw = await voucherService.getAllVouchers(req.orgId, voucherCol);
        const lrIndex = buildVoucherLrIndex(scopeVouchersToPlant(allVouchersRaw, plantKey));
        const missingLrs = [];
        const alreadyInvoicedLrs = [];
        let blankCount = 0;
        const toMark = new Map(); // voucher.id -> { voucher, lrNos }
        for (const it of items) {
            if (!String(it.lrNo || '').trim()) { blankCount++; continue; }
            const v = findVoucherForLr(lrIndex, it.lrNo);
            if (!v) { missingLrs.push(String(it.lrNo).trim()); continue; }
            if (isLrInvoicedOnVoucher(v, it.lrNo)) { alreadyInvoicedLrs.push(String(it.lrNo).trim()); continue; }
            const slot = toMark.get(v.id) || { voucher: v, lrNos: [] };
            slot.lrNos.push(it.lrNo);
            toMark.set(v.id, slot);
        }
        if (blankCount > 0) {
            return res.status(400).json({ error: `${blankCount} entr${blankCount === 1 ? 'y has' : 'ies have'} no LR number — remove them from the bill first`, blankCount });
        }
        if (missingLrs.length > 0 || alreadyInvoicedLrs.length > 0) {
            const parts = [];
            if (missingLrs.length > 0) parts.push(`${missingLrs.length} entr${missingLrs.length === 1 ? 'y is' : 'ies are'} not in the Balance Sheet (add the voucher entry first): ${missingLrs.slice(0, 5).join(', ')}${missingLrs.length > 5 ? '…' : ''}`);
            if (alreadyInvoicedLrs.length > 0) parts.push(`${alreadyInvoicedLrs.length} entr${alreadyInvoicedLrs.length === 1 ? 'y is' : 'ies are'} already invoiced in the Balance Sheet: ${alreadyInvoicedLrs.slice(0, 5).join(', ')}${alreadyInvoicedLrs.length > 5 ? '…' : ''}`);
            return res.status(409).json({ error: parts.join('. '), missingLrs, alreadyInvoiced: alreadyInvoicedLrs });
        }

        // Check duplicate bill number
        if (isAvailable()) {
            const existing = await db.collection(getCol(COL_INVOICES))
                .where('billNo', '==', String(billNo))
                .get();
            if (!existing.empty) {
                return res.status(409).json({ error: `Bill #${billNo} already exists` });
            }

            // Check if any LR numbers already invoiced (only fetch invoices that overlap)
            const lrNosToCheck = items.map(it => it.lrNo).filter(Boolean);
            const duplicateLRs = [];
            if (lrNosToCheck.length > 0) {
                // Firestore 'in' supports up to 30 items per query; chunk if needed
                const chunks = [];
                for (let i = 0; i < lrNosToCheck.length; i += 30) chunks.push(lrNosToCheck.slice(i, i + 30));
                for (const chunk of chunks) {
                    const snap = await db.collection(getCol(COL_INVOICES))
                        .where('lrNos', 'array-contains-any', chunk).get();
                    snap.docs.forEach(d => {
                        (d.data().items || []).forEach(it => { if (it.lrNo && chunk.includes(it.lrNo)) duplicateLRs.push(it.lrNo); });
                    });
                }
            }
            if (duplicateLRs.length > 0) {
                return res.status(409).json({ error: `${duplicateLRs.length} entries already invoiced: ${duplicateLRs.slice(0, 3).join(', ')}${duplicateLRs.length > 3 ? '...' : ''}` });
            }
        }

        // Generate PDF
        const { generateInvoicePDF } = require('../utils/pdfService');
        const pdfBuffer = await generateInvoicePDF({
            plantKey, billNo, billDate, items, gstRate: gstRate || 6
        }, null);

        // Calculate totals for registry
        const totalFreight = items.reduce((s, it) =>
            s + (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0), 0);
        const rate = gstRate || 6;
        const totalGST = parseFloat((totalFreight * rate * 2 / 100).toFixed(2));
        const totalWithGST = parseFloat((totalFreight + totalGST).toFixed(2));

        // Mark the balance-sheet entries (per LR) and save the registry doc as
        // one unit: if either fails, roll the marks back so the sheet never
        // claims a bill that does not exist. Skipped entirely in local mode —
        // no registry doc would exist there to ever release the marks.
        if (isAvailable()) {
            try {
                for (const { voucher, lrNos } of toMark.values()) {
                    await markVoucherLrs(voucher, lrNos, billNo, billDate, voucherCol);
                }
                await db.collection(getCol(COL_INVOICES)).add({
                    billNo: String(billNo),
                    billDate: billDate || '',
                    plantKey: plantKey || 'jksuper_jharli',
                    type: type || 'Dump',
                    itemCount: items.length,
                    totalFreight: Math.round(totalFreight),
                    totalWithGST,
                    gstRate: rate,
                    status: 'generated',
                    lrNos: items.map(it => String(it.lrNo || '').trim()).filter(Boolean),
                    items: items.map(it => ({
                        consigneeName: it.consigneeName || '',
                        destination: it.destination || '',
                        truckNo: it.truckNo || '',
                        lrNo: it.lrNo || '',
                        invoiceNo: it.invoiceNo || '',
                        invoiceDate: it.invoiceDate || '',
                        billedQty: parseFloat(it.billedQty) || 0,
                        recQty: parseFloat(it.recQty) || 0,
                        ratePMT: parseFloat(it.ratePMT) || 0,
                        shortQty: parseFloat(it.shortQty) || 0,
                    })),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch (e) {
                await unmarkBillFromVouchers(billNo, req).catch(() => {});
                throw e;
            }
        }

        // Mark matched LRs as invoiced
        if (isAvailable()) {
            const lrService = require('../services/lrService');
            const ids = (req.body.ids || []).filter(Boolean);
            if (ids.length > 0) {
                try {
                    const baseCols = { dump: 'loading_receipts', jkl: 'jkl_loading_receipts', kosli: 'kosli_loading_receipts', jhajjar: 'jhajjar_loading_receipts' };
                    const col = getEnvCol(baseCols[brand] || 'loading_receipts');
                    await lrService.generateBulkInvoice(ids, billNo, billDate, col);
                } catch (e) {
                    console.warn('[Invoice] LR update non-fatal:', e.message);
                }
            }
        }

        // Background Drive backup
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const TEMP_DIR = path.join(require('os').tmpdir(), 'vgtc_backups');
                    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
                    const safeBillNo = String(billNo).replace(/[/\\?%*:|"<>]/g, '-');
                    const safeType = String(type || 'Dump').replace(/[/\\?%*:|"<>]/g, '-');
                    const fileName = `Invoice_Bill-${safeBillNo}_${safeType}_${billDate || 'draft'}.pdf`;
                    const localPath = path.join(TEMP_DIR, fileName);
                    fs.writeFileSync(localPath, pdfBuffer);
                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    const plantFolder = await driveService.getOrCreateFolder('JK_Super', rootId);
                    const invFolder = await driveService.getOrCreateFolder('Invoices', plantFolder);
                    await driveService.uploadFile(localPath, fileName, invFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                    console.log(`[Invoice] Backed up: ${fileName}`);
                } catch (e) {
                    console.error('[Invoice] Drive backup failed:', e.message);
                }
            })();
        }

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Invoice_${billNo}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (e) {
        console.error('Invoice generate failed:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── GET /invoices/pending — list pending entries ──
router.get('/pending', async (req, res) => {
    try {
        if (!isAvailable()) return res.json([]);
        const snap = await db.collection(getCol(COL_PENDING)).get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── POST /invoices/pending — save pending entries (bulk, deduplicates by LR No) ──
router.post('/pending', async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !items.length) return res.json({ saved: 0 });
        if (!isAvailable()) return res.json({ saved: 0 });

        // Get existing LR numbers to avoid duplicates
        const existingSnap = await db.collection(getCol(COL_PENDING)).get();
        const existingLRs = new Set(existingSnap.docs.map(d => d.data().lrNo).filter(Boolean));

        const newItems = items.filter(it => it.lrNo && !existingLRs.has(it.lrNo));
        if (newItems.length === 0) return res.json({ saved: 0, skipped: items.length });

        const batch = db.batch();
        for (const item of newItems) {
            const ref = db.collection(getCol(COL_PENDING)).doc();
            batch.set(ref, {
                lrNo: item.lrNo || '',
                truckNo: item.truckNo || '',
                consigneeName: item.consigneeName || '',
                destination: item.destination || '',
                invoiceNo: item.invoiceNo || '',
                invoiceDate: item.invoiceDate || '',
                billedQty: parseFloat(item.billedQty) || 0,
                totalFreight: parseFloat(item.totalFreight) || 0,
                ratePMT: parseFloat(item.ratePMT) || 0,
                reason: item.reason || 'Not in Sheet2',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
        res.json({ saved: newItems.length, skipped: items.length - newItems.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── DELETE /invoices/pending/:id — remove single pending entry ──
router.delete('/pending/:id', async (req, res) => {
    try {
        if (!isAvailable()) return res.json({ deleted: true });
        await db.collection(getCol(COL_PENDING)).doc(req.params.id).delete();
        res.json({ deleted: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── POST /invoices/pending/delete — delete single pending (POST fallback) ──
router.post('/pending/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'No ID' });
        if (!isAvailable()) return res.json({ deleted: true });
        await db.collection(getCol(COL_PENDING)).doc(id).delete();
        res.json({ deleted: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── DELETE /invoices/pending — clear all pending ──
router.delete('/pending', async (req, res) => {
    try {
        if (!isAvailable()) return res.json({ deleted: 0 });
        const snap = await db.collection(getCol(COL_PENDING)).get();
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        res.json({ deleted: snap.size });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── GET /invoices/:id/pdf — re-generate and return PDF for viewing ──
router.get('/:id/pdf', async (req, res) => {
    try {
        if (!isAvailable()) return res.status(404).json({ error: 'Not available' });
        const doc = await db.collection(getCol(COL_INVOICES)).doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Invoice not found' });
        const inv = doc.data();
        const { generateInvoicePDF } = require('../utils/pdfService');
        // Ensure all item fields exist for PDF generation
        const safeItems = (inv.items || []).map(it => ({
            consigneeName: it.consigneeName || '', destination: it.destination || '',
            truckNo: it.truckNo || '', lrNo: it.lrNo || '',
            invoiceNo: it.invoiceNo || '', invoiceDate: it.invoiceDate || '',
            billedQty: parseFloat(it.billedQty) || 0, recQty: parseFloat(it.recQty) || parseFloat(it.billedQty) || 0,
            ratePMT: parseFloat(it.ratePMT) || 0, shortQty: parseFloat(it.shortQty) || 0,
        }));
        const pdfBuffer = await generateInvoicePDF({
            plantKey: inv.plantKey || 'jksuper_jharli',
            billNo: inv.billNo, billDate: inv.billDate,
            items: safeItems, gstRate: inv.gstRate || 6,
        }, null);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Invoice_${inv.billNo}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── PUT /invoices/:id — update invoice (edit entries, keep same bill number) ──
router.put('/:id', async (req, res) => {
    try {
        if (!isAvailable()) return res.status(500).json({ error: 'DB not available' });
        const { items, billDate, type, gstRate, status } = req.body;
        const docRef = db.collection(getCol(COL_INVOICES)).doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Invoice not found' });

        const updateObj = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (billDate !== undefined) updateObj.billDate = billDate;
        if (type !== undefined) updateObj.type = type;
        if (status !== undefined) updateObj.status = status;

        if (items !== undefined) {
            // Keep balance-sheet marks in sync with the edited item list:
            // verify + mark LRs added to the bill, unmark LRs removed from it.
            const inv = doc.data();
            const bill = String(inv.billNo);
            const voucherCol = getTenantCol('vouchers', req);
            const allVouchersRaw = await voucherService.getAllVouchers(req.orgId, voucherCol);
            const lrIndex = buildVoucherLrIndex(scopeVouchersToPlant(allVouchersRaw, inv.plantKey));

            const oldKeys = new Set((inv.items || []).map(it => lrStrip(it.lrNo)).filter(Boolean));
            const newKeys = new Set((items || []).map(it => lrStrip(it.lrNo)).filter(Boolean));

            const missingLrs = [];
            const alreadyInvoicedLrs = [];
            const toMark = new Map();
            for (const it of items || []) {
                const key = lrStrip(it.lrNo);
                if (!key || oldKeys.has(key)) continue; // unchanged entries stay as-is
                const v = findVoucherForLr(lrIndex, it.lrNo);
                if (!v) { missingLrs.push(String(it.lrNo).trim()); continue; }
                if (isLrInvoicedOnVoucher(v, it.lrNo)) { alreadyInvoicedLrs.push(String(it.lrNo).trim()); continue; }
                const slot = toMark.get(v.id) || { voucher: v, lrNos: [] };
                slot.lrNos.push(it.lrNo);
                toMark.set(v.id, slot);
            }
            if (missingLrs.length > 0 || alreadyInvoicedLrs.length > 0) {
                const parts = [];
                if (missingLrs.length > 0) parts.push(`${missingLrs.length} added entr${missingLrs.length === 1 ? 'y is' : 'ies are'} not in the Balance Sheet: ${missingLrs.slice(0, 5).join(', ')}`);
                if (alreadyInvoicedLrs.length > 0) parts.push(`${alreadyInvoicedLrs.length} added entr${alreadyInvoicedLrs.length === 1 ? 'y is' : 'ies are'} already invoiced: ${alreadyInvoicedLrs.slice(0, 5).join(', ')}`);
                return res.status(409).json({ error: parts.join('. '), missingLrs, alreadyInvoiced: alreadyInvoicedLrs });
            }

            // Unmark this bill's entries that were removed from the item list
            for (const v of allVouchersRaw) {
                const entries = Array.isArray(v.invoicedLrNos) ? v.invoicedLrNos : null;
                if (!entries) continue;
                const remaining = entries.filter(e => !(String(e.billNo) === bill && !newKeys.has(e.lr)));
                if (remaining.length !== entries.length) {
                    await voucherService.updateVoucher(v.id, {
                        invoicedLrNos: remaining,
                        invoiceGenerated: remaining.length > 0,
                        invoiceBillNo: remaining.length > 0 ? String(remaining[remaining.length - 1].billNo) : '',
                    }, voucherCol);
                }
            }
            for (const { voucher, lrNos } of toMark.values()) {
                await markVoucherLrs(voucher, lrNos, inv.billNo, billDate || inv.billDate, voucherCol);
            }
            updateObj.lrNos = (items || []).map(it => String(it.lrNo || '').trim()).filter(Boolean);

            const totalFreight = (items || []).reduce((s, it) =>
                s + (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0), 0);
            const rate = gstRate || doc.data().gstRate || 6;
            const totalGST = parseFloat((totalFreight * rate * 2 / 100).toFixed(2));

            updateObj.items = (items || []).map(it => ({
                consigneeName: it.consigneeName, destination: it.destination,
                truckNo: it.truckNo, lrNo: it.lrNo, invoiceNo: it.invoiceNo,
                invoiceDate: it.invoiceDate,
                billedQty: parseFloat(it.billedQty) || 0,
                recQty: parseFloat(it.recQty) || 0,
                ratePMT: parseFloat(it.ratePMT) || 0,
                shortQty: parseFloat(it.shortQty) || 0,
            }));
            updateObj.gstRate = rate;
            updateObj.itemCount = (items || []).length;
            updateObj.totalFreight = Math.round(totalFreight);
            updateObj.totalWithGST = parseFloat((totalFreight + totalGST).toFixed(2));
        } else if (gstRate !== undefined) {
            const existingItems = doc.data().items || [];
            const totalFreight = existingItems.reduce((s, it) =>
                s + (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0), 0);
            const rate = gstRate;
            const totalGST = parseFloat((totalFreight * rate * 2 / 100).toFixed(2));

            updateObj.gstRate = rate;
            updateObj.totalWithGST = parseFloat((totalFreight + totalGST).toFixed(2));
        }

        await docRef.update(updateObj);
        res.json({ updated: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── POST /invoices/delete — delete a generated invoice (POST to avoid DELETE routing issues) ──
router.post('/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'No ID provided' });
        if (!isAvailable()) return res.json({ deleted: true });
        const col = getCol(COL_INVOICES);
        const doc = await db.collection(col).doc(id).get();
        if (!doc.exists) return res.json({ deleted: true });
        const inv = doc.data();

        // Free the balance-sheet entries BEFORE deleting the bill — if the
        // unmark fails the bill stays and the delete can simply be retried,
        // instead of leaving vouchers locked to a bill that no longer exists.
        await unmarkBillFromVouchers(inv.billNo, req);
        await db.collection(col).doc(id).delete();
        res.json({ deleted: true });
    } catch (e) {
        console.error('[Invoice] Delete error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
