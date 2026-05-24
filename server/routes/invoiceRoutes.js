const express = require('express');
const router = express.Router();
const { db, admin, isAvailable } = require('../firebase');
const { getEnvCol } = require('../utils/collectionUtils');
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const driveService = require('../utils/driveService');

router.use(requireAuth, tenancyMiddleware);

const COL_INVOICES = 'invoices';
const COL_PENDING = 'pending_invoice_items';

const getCol = (base) => getEnvCol(base);

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

        // Check duplicate bill number
        if (isAvailable()) {
            const existing = await db.collection(getCol(COL_INVOICES))
                .where('billNo', '==', String(billNo))
                .get();
            if (!existing.empty) {
                return res.status(409).json({ error: `Bill #${billNo} already exists` });
            }

            // Check if any LR numbers already invoiced
            const allInvoices = await db.collection(getCol(COL_INVOICES)).get();
            const invoicedLRs = new Set();
            allInvoices.docs.forEach(d => {
                const data = d.data();
                (data.items || []).forEach(it => { if (it.lrNo) invoicedLRs.add(it.lrNo); });
            });
            const duplicateLRs = items.filter(it => it.lrNo && invoicedLRs.has(it.lrNo)).map(it => it.lrNo);
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

        // Save to invoice registry
        if (isAvailable()) {
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
        const { items, billDate, type, gstRate } = req.body;
        const docRef = db.collection(getCol(COL_INVOICES)).doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Invoice not found' });

        const totalFreight = (items || []).reduce((s, it) =>
            s + (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0), 0);
        const rate = gstRate || doc.data().gstRate || 6;
        const totalGST = parseFloat((totalFreight * rate * 2 / 100).toFixed(2));

        await docRef.update({
            items: (items || []).map(it => ({
                consigneeName: it.consigneeName, destination: it.destination,
                truckNo: it.truckNo, lrNo: it.lrNo, invoiceNo: it.invoiceNo,
                invoiceDate: it.invoiceDate,
                billedQty: parseFloat(it.billedQty) || 0,
                recQty: parseFloat(it.recQty) || 0,
                ratePMT: parseFloat(it.ratePMT) || 0,
                shortQty: parseFloat(it.shortQty) || 0,
            })),
            billDate: billDate || doc.data().billDate,
            type: type || doc.data().type,
            gstRate: rate,
            itemCount: (items || []).length,
            totalFreight: Math.round(totalFreight),
            totalWithGST: parseFloat((totalFreight + totalGST).toFixed(2)),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

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
        await db.collection(col).doc(id).delete();
        res.json({ deleted: true });
    } catch (e) {
        console.error('[Invoice] Delete error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
