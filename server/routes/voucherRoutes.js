const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');
const vehicleService = require('../services/vehicleService');
const { getCol } = require('../utils/collectionUtils');
const driveService = require('../utils/driveService');

const BASE_COL = 'vouchers';
const VEHICLE_COL = 'vehicles';

// ─── Create ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const result = await voucherService.createVoucher(req.body, getCol(BASE_COL, req));
        await vehicleService.ensureVehicleByTruckNo(req.body.truckNo, getCol(VEHICLE_COL, req)).catch((error) => {
            console.error('[Voucher-Hook] Vehicle ensure failed:', error.message);
        });

        // Real-time backup — runs whenever Google Drive is authorized
        const authorized = await driveService.isAuthorized();
        console.log(`[Backup-Hook] Drive authorized: ${authorized}`);
        if (authorized) {
            (async () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const { generateVoucherPDF } = require('../utils/pdfService');
                    const sheetsService = require('../utils/sheetsService');
                    const { PLANTS } = require('../utils/backupService');

                    const voucherData = { ...req.body, ...result };
                    const TEMP_DIR = path.join(__dirname, '..', 'temp_backups');
                    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

                    const dateStr = (voucherData.date || new Date().toLocaleDateString('en-IN')).replace(/\//g, '-');
                    const fileName = `Voucher_LR${voucherData.lrNo || 'N-A'}_${dateStr}.pdf`;
                    const localPath = path.join(TEMP_DIR, fileName);

                    console.log(`[Backup-Hook] Generating voucher PDF: ${fileName}`);
                    await generateVoucherPDF(voucherData, localPath);

                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    // Route to exact Plant folders instead of global 'Dump'
                    const plantLabel = (req.body.brand === 'jklakshmi' || voucherData.type === 'JK_Lakshmi') ? 'JK_Lakshmi' : 'JK_Super';
                    const plantFolder = await driveService.getOrCreateFolder(plantLabel, rootId);
                    const finalFolder = await driveService.getOrCreateFolder('Vouchers', plantFolder);
                    await driveService.uploadFile(localPath, fileName, finalFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

                    // Upsert row in Google Sheet - send exact brand!
                    await sheetsService.upsertVoucherRow(voucherData, req.body.type || 'Dump', req.body.brand);

                    await driveService.logActivity('Voucher_Create', 'success', `Backed up: ${fileName}`);
                    console.log(`[Backup-Hook] Voucher backed up successfully: ${fileName}`);
                } catch (e) {
                    console.error('[Backup-Hook] Voucher create FAILED:', e.message);
                    console.error(e.stack);
                    await driveService.logActivity('Voucher_Create', 'error', 'Backup failed', e).catch(() => {});
                }
            })();
        } else {
            console.log('[Backup-Hook] Skipping voucher backup — Drive not authorized');
        }

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Get all by type ──────────────────────────────────────────────────────────
router.get('/:type', async (req, res) => {
    try {
        const vouchers = await voucherService.getVouchersByType(req.params.type, getCol(BASE_COL, req));
        res.json(vouchers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Update (includes balance-sheet edits + mark-paid) ───────────────────────
router.patch('/:id', async (req, res) => {
    try {
        const col = getCol(BASE_COL, req);
        await voucherService.updateVoucher(req.params.id, req.body, col);
        if (req.body.truckNo) {
            await vehicleService.ensureVehicleByTruckNo(req.body.truckNo, getCol(VEHICLE_COL, req)).catch((error) => {
                console.error('[Voucher-Hook] Vehicle ensure failed on update:', error.message);
            });
        }

        // Sync updated row to Google Sheet — runs whenever Drive is authorized
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const sheetsService = require('../utils/sheetsService');
                    // Fetch the full updated voucher so we have the type + all current fields
                    const updated = await voucherService.getVoucherById(req.params.id, col);
                    if (updated && updated.type) {
                        await sheetsService.upsertVoucherRow(updated, updated.type, updated.brand);
                        
                        // Pay Vehicles Hook
                        if (parseFloat(updated.paidBalance) > 0) {
                            await sheetsService.upsertPayHistory(updated, updated.brand);
                        } else {
                            await sheetsService.deletePayHistory(updated.id, updated.brand);
                        }

                        console.log(`[Sheets] Synced update for voucher ${req.params.id}`);
                    }
                } catch (e) {
                    console.error('[Sheets-Hook] Voucher update sync failed:', e.message);
                }
            })();
        }

        res.json({ message: 'Voucher updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const col = getCol(BASE_COL, req);
        const existing = await voucherService.getVoucherById(req.params.id, col);
        
        await voucherService.deleteVoucher(req.params.id, col);

        if (await driveService.isAuthorized() && existing) {
            (async () => {
                try {
                    const sheetsService = require('../utils/sheetsService');
                    await sheetsService.deleteVoucherRow(req.params.id, existing.type, existing.brand);
                    await sheetsService.deletePayHistory(req.params.id, existing.brand);
                    console.log(`[Sheets] Deleted row for voucher ${req.params.id}`);
                } catch (e) {
                    console.error('[Sheets-Hook] Voucher delete sync failed:', e.message);
                }
            })();
        }

        res.json({ message: 'Voucher deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
