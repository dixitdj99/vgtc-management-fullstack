const express = require('express');
const router = express.Router();
const lrService = require('../services/lrService');
const { getCol } = require('../utils/collectionUtils');
const driveService = require('../utils/driveService');

const BASE_COL = 'jhajjar_loading_receipts';
const META_COL = 'jhajjar_metadata';

// Create
router.post('/', async (req, res) => {
    try {
        const result = await lrService.createLoadingReceipt(
            req.body, 
            getCol(BASE_COL, req), 
            getCol(META_COL, req)
        );

        // Real-time backup — runs whenever Google Drive is authorized
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

                    console.log(`[Backup-Hook] Generating LR PDF: ${fileName}`);
                    await generateLoadingReceiptPDF(fullData, localPath);

                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    
                    const brand = req.body.brand === 'jklakshmi' ? 'JK_Lakshmi' : 'JK_Super';
                    const plantFolder = await driveService.getOrCreateFolder(brand, rootId);
                    
                    // Match requested architecture
                    const finalFolder = await driveService.getOrCreateFolder('Loading Receipt Individual', plantFolder);
                    await driveService.uploadFile(localPath, fileName, finalFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

                    const sheetsService = require('../utils/sheetsService');
                    await sheetsService.upsertLrRow(fullData, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper');

                    await driveService.logActivity('LR_Create', 'success', `Backed up: ${fileName}`);
                    console.log(`[Backup-Hook] LR backed up successfully: ${fileName}`);
                } catch (e) {
                    console.error('[Backup-Hook] LR create FAILED:', e.message, e.stack);
                    await driveService.logActivity('LR_Create', 'error', 'Backup failed', e);
                }
            })();
        } else {
            console.log('[Backup-Hook] Skipping LR backup — Drive not authorized');
        }

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const receipts = await lrService.getAllLoadingReceipts(getCol(BASE_COL, req));
        res.json(receipts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update billing only
router.patch('/:id/billing', async (req, res) => {
    try {
        await lrService.updateBillingStatus(req.params.id, req.body.billing, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const all = await lrService.getAllLoadingReceipts(getCol(BASE_COL, req));
            const doc = all.find(r => r.id === req.params.id);
            if (doc) await sheetsService.upsertLrRow(doc, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Billing status updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Full update of a single receipt row (Support both PATCH and PUT)
router.patch('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await lrService.deleteLoadingReceipt(req.params.id, getCol(BASE_COL, req), getCol(META_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            await sheetsService.deleteLrRow(req.params.id, req.query.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Receipt deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk Invoice Generation
router.post('/invoice/generate', async (req, res) => {
    try {
        const { ids, invoiceNumber, invoiceDate, partyName, items, brand } = req.body;
        await lrService.generateBulkInvoice(ids, invoiceNumber, invoiceDate, getCol(BASE_COL, req));
        
        // Background backup to Google Drive
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const { generateInvoicePDF } = require('../utils/pdfService');

                    const TEMP_DIR = path.join(__dirname, '..', 'temp_backups');
                    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

                    const safeInvoiceNo = (invoiceNumber || 'Untitled').replace(/[/\\?%*:|"<>]/g, '-');
                    const fileName = `Invoice_${safeInvoiceNo}_${Date.now()}.pdf`;
                    const localPath = path.join(TEMP_DIR, fileName);

                    await generateInvoicePDF({ invoiceNumber, invoiceDate, partyName, items }, localPath);

                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    const plantName = brand === 'jklakshmi' ? 'JK_Lakshmi' : 'JK_Super';
                    const plantFolder = await driveService.getOrCreateFolder(plantName, rootId);
                    const finalFolder = await driveService.getOrCreateFolder('Invoices', plantFolder);
                    
                    await driveService.uploadFile(localPath, fileName, finalFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                    console.log(`[Backup-Hook] Invoice backed up: ${fileName}`);
                } catch (e) {
                    console.error('[Backup-Hook] Invoice backup FAILED:', e.message);
                }
            })();
        }

        res.json({ message: 'Invoice generated and LRs updated successfully' });
    } catch (error) {
        console.error('Invoice generation failed:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
