const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');
const vehicleService = require('../services/vehicleService');
const { getCol } = require('../utils/collectionUtils');
const driveService = require('../utils/driveService');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const { sendEventNotification, lookupVehicleInfo, lookupVehiclePhone, getWhatsAppConfig } = require('../utils/whatsappService');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'vouchers';
const VEHICLE_COL = 'vehicles';

// ─── Create ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const result = await voucherService.createVoucher(req.orgId, req.body, getCol(BASE_COL, req));
        await vehicleService.ensureVehicleByTruckNo(req.body.truckNo, getCol(VEHICLE_COL, req)).catch((error) => {
            console.error('[Voucher-Hook] Vehicle ensure failed:', error.message);
        });

        // Real-time backup — fire and forget, never blocks response
        const savedResult = result;
        const savedBody = { ...req.body };
        res.status(201).json(result);

        // WhatsApp Notification — fire and forget
        ;(async () => {
            try {
                const vData = { ...savedBody, ...savedResult };

                // Calculate gross and net freight
                const gross = vData.deliveries?.length > 0
                    ? vData.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
                    : (parseFloat(vData.weight) || 0) * (parseFloat(vData.rate) || 0);
                const diesel     = parseFloat(vData.advanceDiesel) || 0;
                const cash       = parseFloat(vData.advanceCash) || 0;
                const online     = parseFloat(vData.advanceOnline) || 0;
                const weight     = parseFloat(vData.weight) || 0;
                const munshi     = parseFloat(vData.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
                const commission = parseFloat(vData.commission) || 0;
                const net        = gross - diesel - cash - online - munshi - commission;

                const templateData = {
                    voucherNo:     vData.voucherNo || vData.id,
                    lrNo:          vData.lrNo,
                    date:          vData.date || new Date().toLocaleDateString('en-IN'),
                    truckNo:       vData.truckNo,
                    driverName:    vData.driverName || '—',
                    source:        vData.source || 'Jhajjar',
                    destination:   vData.destination,
                    grossFreight:  gross.toFixed(0),
                    advanceDiesel: diesel.toFixed(0),
                    advanceCash:   cash.toFixed(0),
                    advanceOnline: online.toFixed(0),
                    munshi:        munshi.toFixed(0),
                    commission:    commission.toFixed(0),
                    netBalance:    net.toFixed(0),
                    paymentStatus: vData.paymentStatus || 'Balance Pending',
                };

                const vInfo       = await lookupVehicleInfo(vData.truckNo, req);
                const waCfg       = await getWhatsAppConfig(req);
                const adminPhone  = waCfg.adminPhone || '8708032492';

                const isSelf = (vInfo?.ownershipType === 'self') || (vData.ownershipType === 'self') || (vData.isSelf === true);
                const ownerPhone  = vInfo?.ownerContact || vData.ownerContact || '';
                const driverPhone = vInfo?.driverContact || vData.driverContact || '';

                // 1. Driver voucher alert — sent to driver
                if (driverPhone) {
                    await sendEventNotification('voucher_created_driver', templateData, [driverPhone], req);
                }

                // 2. Owner voucher copy — sent ONLY for market vehicles (not self vehicles)
                if (!isSelf && ownerPhone) {
                    await sendEventNotification('voucher_created_owner', templateData, [ownerPhone], req);
                }

                // 3. Admin copy — sent to admin number (8708032492)
                if (adminPhone) {
                    await sendEventNotification('voucher_created_owner', templateData, [adminPhone], req);
                }

                // 4. Online Advance Clerk Alert — sent to admin ONLY when advanceOnline > 0
                //    The clerk must reply "PAID {voucherNo}" to the WhatsApp bot to confirm
                //    payment done. The OpenWA webhook (POST /api/whatsapp/webhook) will then
                //    mark isOnlinePaid = true and notify owner + driver.
                if (online > 0 && adminPhone) {
                    await sendEventNotification('online_advance_clerk', templateData, [adminPhone], req);
                    console.log(`[WA-Hook] Online advance clerk alert sent for voucher ${templateData.voucherNo} (Rs.${templateData.advanceOnline})`);
                }
            } catch (waErr) {
                console.error('[WA-Hook] Voucher notify FAILED:', waErr.message);
            }
        })();

        (async () => {
            try {
                if (!await driveService.isAuthorized()) {
                    console.log('[Backup-Hook] Skipping voucher backup — Drive not authorized');
                    return;
                }
                const fs = require('fs');
                const path = require('path');
                const { generateVoucherPDF } = require('../utils/pdfService');
                const sheetsService = require('../utils/sheetsService');

                const voucherData = { ...savedBody, ...savedResult };
                const TEMP_DIR = path.join(require('os').tmpdir(), 'vgtc_backups');
                if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

                const dateStr = (voucherData.date || new Date().toLocaleDateString('en-IN')).replace(/\//g, '-');
                const fileName = `Voucher_LR${voucherData.lrNo || 'N-A'}_${dateStr}.pdf`;
                const localPath = path.join(TEMP_DIR, fileName);

                console.log(`[Backup-Hook] Generating voucher PDF: ${fileName}`);
                await generateVoucherPDF(voucherData, localPath);

                const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                const plantLabel = (savedBody.brand === 'jklakshmi' || voucherData.type === 'JK_Lakshmi') ? 'JK_Lakshmi' : 'JK_Super';
                const plantFolder = await driveService.getOrCreateFolder(plantLabel, rootId);
                const voucherFolder = await driveService.getOrCreateFolder('Vouchers', plantFolder);
                const monthStr = new Date(voucherData.date || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).replace(/ /g, '_');
                const finalFolder = await driveService.getOrCreateFolder(monthStr, voucherFolder);
                await driveService.uploadFile(localPath, fileName, finalFolder);
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

                await sheetsService.upsertVoucherRow(voucherData, savedBody.type || 'Dump', savedBody.brand);

                await driveService.logActivity('Voucher_Create', 'success', `Backed up: ${fileName}`);
                console.log(`[Backup-Hook] Voucher backed up successfully: ${fileName}`);
            } catch (e) {
                console.error('[Backup-Hook] Voucher create FAILED:', e.message);
                console.error(e.stack);
                await driveService.logActivity('Voucher_Create', 'error', 'Backup failed', e).catch(() => {});
            }
        })();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Get all by type ──────────────────────────────────────────────────────────
router.get('/:type', async (req, res) => {
    try {
        const vouchers = await voucherService.getVouchersByType(req.orgId, req.params.type, getCol(BASE_COL, req));
        res.json(vouchers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Get all ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const vouchers = await voucherService.getAllVouchers(req.orgId, getCol(BASE_COL, req));
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


        res.json({ message: 'Voucher updated' });

        // Sync updated row + re-upload PDF — runs in background after response
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const { generateVoucherPDF } = require('../utils/pdfService');
                    const sheetsService = require('../utils/sheetsService');

                    const updated = await voucherService.getVoucherById(req.params.id, col);
                    if (!updated || !updated.type) return;

                    // 1. Sync to Google Sheets
                    await sheetsService.upsertVoucherRow(updated, updated.type, updated.brand);
                    if (parseFloat(updated.paidBalance) > 0) {
                        await sheetsService.upsertPayHistory(updated, updated.brand);
                    } else {
                        await sheetsService.deletePayHistory(updated.id, updated.brand);
                    }

                    // 2. Re-generate and re-upload PDF to Drive
                    const TEMP_DIR = path.join(require('os').tmpdir(), 'vgtc_backups');
                    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
                    const dateStr = (updated.date || new Date().toLocaleDateString('en-IN')).replace(/\//g, '-');
                    const fileName = `Voucher_LR${updated.lrNo || 'N-A'}_${dateStr}.pdf`;
                    const localPath = path.join(TEMP_DIR, fileName);

                    await generateVoucherPDF(updated, localPath);
                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    const plantLabel = (updated.brand === 'jklakshmi' || updated.type === 'JK_Lakshmi') ? 'JK_Lakshmi' : 'JK_Super';
                    const plantFolder = await driveService.getOrCreateFolder(plantLabel, rootId);
                    const voucherFolder = await driveService.getOrCreateFolder('Vouchers', plantFolder);
                    const monthStr = new Date(updated.date || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).replace(/ /g, '_');
                    const finalFolder = await driveService.getOrCreateFolder(monthStr, voucherFolder);
                    await driveService.uploadFile(localPath, fileName, finalFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

                    await driveService.logActivity('Voucher_Update', 'success', `Synced: ${fileName}`);
                    console.log(`[Backup-Hook] Voucher update synced: ${fileName}`);
                } catch (e) {
                    console.error('[Backup-Hook] Voucher update sync failed:', e.message);
                    await driveService.logActivity('Voucher_Update', 'error', 'Sync failed', e).catch(() => {});
                }
            })();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Diesel Verification ─────────────────────────────────────────────────────
router.patch('/:id/verify-diesel', async (req, res) => {
    const { dieselActualLitres, dieselPumpName, dieselActualAmount } = req.body;
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const col = getCol(BASE_COL, req);
        const update = {
            isDieselVerified: true,
            dieselVerifiedAt: new Date().toISOString(),
            dieselVerifiedBy: req.user?.name || 'system',
        };
        // Only written when actually sent. Verification is now about the amount,
        // so the screens no longer ask for litres or a pump — and writing the
        // defaults for absent fields would blank whatever an earlier
        // verification had recorded.
        if (dieselActualLitres !== undefined && dieselActualLitres !== '') {
            update.dieselActualLitres = parseFloat(dieselActualLitres) || 0;
        }
        if (dieselPumpName !== undefined && dieselPumpName !== '') {
            update.dieselPumpName = String(dieselPumpName);
        }

        /**
         * A full tank is booked as the literal "FULL", which every net
         * calculation treats as a ₹4,000 estimate — so the voucher stays wrong
         * until someone knows the real bill. Verification is when that number
         * arrives, so recording it here replaces the estimate and the net
         * becomes true. Without this the estimate stood for ever.
         *
         * Only ever narrows FULL to a figure; an already-numeric advance is left
         * alone, because verification is not the place to re-price a trip.
         */
        const actual = parseFloat(dieselActualAmount);
        if (actual > 0) {
            const existing = await voucherService.getVoucherById(req.params.id, col);
            const booked = existing ? existing.advanceDiesel : null;
            if (booked === 'FULL' || (booked && isNaN(parseFloat(booked)))) {
                update.advanceDiesel = String(actual);
                update.dieselEstimatedAmount = booked;   // what it replaced
            }
        }
        if (isAvailable()) {
            await db.collection(col).doc(req.params.id).update({
                ...update,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        res.json({ message: 'Diesel verified', ...update });

        // Sync verification to Google Sheets in background
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const sheetsService = require('../utils/sheetsService');
                    const updated = await voucherService.getVoucherById(req.params.id, getCol(BASE_COL, req));
                    if (updated) await sheetsService.upsertVoucherRow(updated, updated.type, updated.brand);
                } catch (e) { console.error('[Sheets] Diesel verify sync failed:', e.message); }
            })();
        }
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
