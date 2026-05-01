const express = require('express');
const router = express.Router();
const lrService = require('../services/lrService');
const { getCol } = require('../utils/collectionUtils');

const JKL_LR_COL = 'jkl_loading_receipts';
const JKL_META_COL = 'jkl_metadata';

// Create
router.post('/', async (req, res) => {
    try {
        const result = await lrService.createLoadingReceipt(req.body, getCol(JKL_LR_COL, req), getCol(JKL_META_COL, req));

        // Real-time backup — runs whenever Google Drive is authorized
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const { generateLoadingReceiptPDF } = require('../utils/pdfService');

                    const TEMP_DIR = path.join(__dirname, '..', 'temp_backups');
                    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

                    const fullData = { ...req.body, ...result };
                    const dateStr = (fullData.date || new Date().toLocaleDateString('en-IN')).replace(/\//g, '-');
                    const fileName = `LR_${result.lrNo}_${dateStr}.pdf`;
                    const localPath = path.join(TEMP_DIR, fileName);

                    console.log(`[Backup-Hook] Generating JKL LR PDF: ${fileName}`);
                    await generateLoadingReceiptPDF(fullData, localPath);

                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    const plantFolder = await driveService.getOrCreateFolder('JK_Lakshmi', rootId);
                    const finalFolder = await driveService.getOrCreateFolder('Loading Receipt Individual', plantFolder);
                    await driveService.uploadFile(localPath, fileName, finalFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

                    const sheetsService = require('../utils/sheetsService');
                    await sheetsService.upsertLrRow(fullData, 'jklakshmi');

                    await driveService.logActivity('JKL_LR_Create', 'success', `Backed up: ${fileName}`);
                    console.log(`[Backup-Hook] JKL LR backed up successfully: ${fileName}`);
                } catch (e) {
                    console.error('[Backup-Hook] JKL LR create FAILED:', e.message, e.stack);
                    await driveService.logActivity('JKL_LR_Create', 'error', 'Backup failed', e);
                }
            })();
        } else {
            console.log('[Backup-Hook] Skipping JKL LR backup — Drive not authorized');
        }

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const receipts = await lrService.getAllLoadingReceipts(getCol(JKL_LR_COL, req));
        res.json(receipts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update billing only
router.patch('/:id/billing', async (req, res) => {
    try {
        await lrService.updateBillingStatus(req.params.id, req.body.billing, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const all = await lrService.getAllLoadingReceipts(getCol(JKL_LR_COL, req));
            const doc = all.find(r => r.id === req.params.id);
            if (doc) await sheetsService.upsertLrRow(doc, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update full LR (Support both PUT and PATCH)
router.put('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await lrService.deleteLoadingReceipt(req.params.id, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            await sheetsService.deleteLrRow(req.params.id, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
