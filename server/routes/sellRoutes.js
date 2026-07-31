const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const svc = require('../utils/sellService');
const driveService = require('../utils/driveService');
const sheetsService = require('../utils/sheetsService');
const pdfService = require('../utils/pdfService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);
const BASE_COL = 'sales';

// GET /api/sell?brand=dump
router.get('/', async (req, res) => {
    try {
        const brand = req.query.brand || 'dump';
        const data = await svc.getAll(req.orgId, getCol(BASE_COL, req));
        // Filter by brand if needed, or return all and let frontend decide
        const filtered = data.filter(d => d.brand === brand);
        res.json(filtered);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sell
router.post('/', async (req, res) => {
    try {
        const brand = req.body.brand || 'dump';
        const doc = await svc.addSale(req.orgId, req.body, getCol(BASE_COL, req));
        
        // Backup Hook
        if (await driveService.isAuthorized()) {
            try {
                // 1. Spreadsheet sync
                await sheetsService.upsertSaleRow(doc, brand).catch(e => console.error('Sheet sync failed:', e));

                // 2. Individual PDF Backup
                const plantFolder = await driveService.getOrCreateFolder(brand === 'jkl' ? 'JK_Lakshmi' : 'JK_Super_Dump');
                const backupFolder = await driveService.getOrCreateFolder('Sales Receipts', plantFolder);
                const fileName = `Sale_${doc.customerName}_${doc.id}.pdf`.replace(/\s+/g, '_');
                const localPath = path.join(__dirname, '../temp', fileName);
                
                if (!fs.existsSync(path.join(__dirname, '../temp'))) fs.mkdirSync(path.join(__dirname, '../temp'));
                
                await pdfService.generateSalePDF(doc, localPath);
                await driveService.uploadFile(localPath, fileName, backupFolder);
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                
                console.log(`[Backup] Sale receipt backed up: ${fileName}`);
            } catch (backupErr) {
                console.error('[Backup Error]', backupErr);
            }
        }

        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ── Sell cash movements ──────────────────────────────────────────────────────
 *
 * The cashbook records physical cash. Sell collects both cash and online
 * payments, so a deposit is capped at the cash actually in hand — which is
 * where online money is refused, since it never counts towards that figure.
 *
 * Registered above `/:id`, though the paths cannot collide: `/:id` matches a
 * single segment and these are two.
 */
const cashbookService = require('../utils/cashbookService');
const MOVES_COL = 'sell_cash_movements';
const cashbookColFor = (brand) => (brand === 'jkl' ? 'jkl_cashbook' : 'cashbook');

// GET /api/sell/cash-movements?brand=dump
router.get('/cash-movements', async (req, res) => {
    try {
        const brand = req.query.brand || 'dump';
        const [movements, cashInHand] = await Promise.all([
            svc.getMovements(req.orgId, brand, getCol(MOVES_COL, req)),
            svc.getCashInHand(req.orgId, brand, getCol(BASE_COL, req), getCol(MOVES_COL, req)),
        ]);
        res.json({ movements, cashInHand });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sell/cash-movements
router.post('/cash-movements', async (req, res) => {
    try {
        const brand = req.body.brand || 'dump';
        const { type, amount, date, remark } = req.body;

        // addMovement enforces the cap, so the cashbook entry is only written
        // once the amount is known to be covered by cash in hand.
        let cashbookEntryId = '';
        if (type === 'to_cashbook') {
            const entry = await cashbookService.addEntry(
                req.orgId, 'deposit', amount,
                `Sell Cash Deposit — ${remark || (brand === 'jkl' ? 'JK Lakshmi Sale' : 'Dump Sale')}`,
                date, getCol(cashbookColFor(brand), req)
            );
            cashbookEntryId = entry?.id || '';
        }

        try {
            const doc = await svc.addMovement(
                req.orgId, { ...req.body, brand, cashbookEntryId },
                getCol(BASE_COL, req), getCol(MOVES_COL, req)
            );
            res.status(201).json(doc);
        } catch (inner) {
            // The deposit was written but the movement was refused — roll it
            // back rather than leave cash in the cashbook that Sell never lost.
            if (cashbookEntryId) {
                await cashbookService.deleteEntry(cashbookEntryId, getCol(cashbookColFor(brand), req)).catch(() => {});
            }
            throw inner;
        }
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/sell/cash-movements/:id
router.delete('/cash-movements/:id', async (req, res) => {
    try {
        const move = await svc.getMovementById(req.params.id, getCol(MOVES_COL, req));
        if (!move) return res.status(404).json({ error: 'Movement not found' });
        if (move.type === 'to_cashbook') {
            return res.status(400).json({
                error: 'A cashbook deposit cannot be deleted from here — it would leave the cashbook entry orphaned. Reverse it in the Cashbook instead.',
            });
        }
        await svc.deleteMovement(req.params.id, getCol(MOVES_COL, req));
        res.json({ deleted: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/sell/:id
router.patch('/:id', async (req, res) => {
    try {
        const doc = await svc.updateSale(req.params.id, req.body, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            await sheetsService.upsertSaleRow(doc, req.body.brand || 'dump').catch(()=>{});
        }
        res.json(doc);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/sell/:id
router.delete('/:id', async (req, res) => {
    try {
        const brand = req.query.brand || 'dump';
        await svc.deleteSale(req.params.id, brand, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            await sheetsService.deleteSaleRow(req.params.id, brand).catch(()=>{});
        }
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
