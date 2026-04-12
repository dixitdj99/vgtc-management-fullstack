const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const svc = require('../utils/sellService');
const driveService = require('../utils/driveService');
const sheetsService = require('../utils/sheetsService');
const pdfService = require('../utils/pdfService');
const { getCol } = require('../utils/collectionUtils');
const BASE_COL = 'sales';

// GET /api/sell?brand=dump
router.get('/', async (req, res) => {
    try {
        const brand = req.query.brand || 'dump';
        const data = await svc.getAll(getCol(BASE_COL, req));
        // Filter by brand if needed, or return all and let frontend decide
        const filtered = data.filter(d => d.brand === brand);
        res.json(filtered);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sell
router.post('/', async (req, res) => {
    try {
        const brand = req.body.brand || 'dump';
        const doc = await svc.addSale(req.body, getCol(BASE_COL, req));
        
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
