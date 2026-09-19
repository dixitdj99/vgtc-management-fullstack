const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');
const vehicleService = require('../services/vehicleService');
const { getCol } = require('../utils/collectionUtils');
const driveService = require('../utils/driveService');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const { sendEventNotification, sendWhatsAppImage, generateVoucherImageBuffer, lookupVehicleInfo, lookupVehiclePhone, getWhatsAppConfig } = require('../utils/whatsappService');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'vouchers';
const VEHICLE_COL = 'vehicles';

// ─── Create ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const voucherData = {
            ...req.body,
            createdBy: req.user?.id || req.user?.username || '',
            createdByName: req.user?.name || req.user?.username || '',
            creatorPhone: req.user?.phone || req.user?.mobile || ''
        };
        const result = await voucherService.createVoucher(req.orgId, voucherData, getCol(BASE_COL, req));
        await vehicleService.ensureVehicleByTruckNo(req.body.truckNo, getCol(VEHICLE_COL, req)).catch((error) => {
            console.error('[Voucher-Hook] Vehicle ensure failed:', error.message);
        });

        // Real-time backup — fire and forget, never blocks response
        const savedResult = result;
        const savedBody = { ...voucherData };
        res.status(201).json(result);

        // WhatsApp Notification — fire and forget
        ;(async () => {
            try {
                const vData = { ...savedBody, ...savedResult };

                // Calculate gross and net freight
                const weight     = parseFloat(vData.weight) || 0;
                const rate       = parseFloat(vData.rate) || 0;
                const gross      = parseFloat(vData.freight) || (vData.deliveries?.length > 0
                    ? vData.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
                    : weight * rate);
                const diesel     = parseFloat(vData.advanceDiesel) || 0;
                const cash       = parseFloat(vData.advanceCash) || 0;
                const online     = parseFloat(vData.advanceOnline) || 0;
                const munshi     = parseFloat(vData.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
                const shortage   = parseFloat(vData.shortage) || 0;
                const commission = parseFloat(vData.commission) || 0;
                const tyrePuncture = parseFloat(vData.tyrePuncture) || 0;
                const tyreGreasing = (parseFloat(vData.tyreGreasingAir) || 0) + (parseFloat(vData.tyreGreasing) || 0) + (parseFloat(vData.tyreAir) || 0);
                const extraCash  = parseFloat(vData.extraCash) || 0;
                const totalDeductions = diesel + cash + online + munshi + shortage + commission + tyrePuncture + tyreGreasing + extraCash;
                const net        = gross - totalDeductions;

                const templateData = {
                    voucherNo:     vData.voucherNo || vData.entryId || vData.id,
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

                const isSelf      = (vInfo?.ownershipType === 'self') || (vData.ownershipType === 'self') || (vData.isSelf === true);
                const ownerPhone  = vInfo?.ownerContact || vData.ownerContact || '';
                const driverPhone = vInfo?.driverContact || vData.driverContact || '';

                const cleanDigits = (p) => {
                    if (!p) return '';
                    let c = String(p).replace(/\D/g, '');
                    if (c.length === 10) c = '91' + c;
                    return c;
                };

                const cleanDriver = cleanDigits(driverPhone);
                const cleanOwner  = cleanDigits(ownerPhone);
                const cleanAdmin  = cleanDigits(adminPhone);

                // 1. Generate Voucher Receipt PNG image buffer
                let voucherImageBuffer = null;
                try {
                    voucherImageBuffer = generateVoucherImageBuffer({
                        ...vData,
                        id: savedResult?.id,
                        voucherNo: templateData.voucherNo,
                        date: templateData.date,
                        weight,
                        rate,
                        freight: gross,
                        advanceDiesel: diesel,
                        advanceCash: cash,
                        advanceOnline: online,
                        munshi,
                        shortage,
                        commission,
                        tyrePuncture,
                        tyreGreasingAir: tyreGreasing,
                        extraCash
                    });
                } catch (imgErr) {
                    console.error('[WA-Hook] Failed to render Voucher image slip:', imgErr.message);
                }

                const voucherCaption = [
                    `*VIKAS GOODS TRANSPORT CO.*`,
                    `📋 *Freight Voucher — #${templateData.voucherNo}*`,
                    `*Date:* ${templateData.date} | *Truck:* ${String(vData.truckNo || '—').toUpperCase()}`,
                    `*LR:* #${templateData.lrNo || '—'} | *Party:* ${vData.partyName || '—'}${vData.destination ? ' (' + vData.destination + ')' : ''}`,
                    `*Gross Freight:* Rs.${gross.toLocaleString('en-IN')}`,
                    `*Total Deductions:* Rs.${totalDeductions.toLocaleString('en-IN')}`,
                    `*Net Balance:* Rs.${net.toLocaleString('en-IN')}`,
                    `_Voucher slip attached above._`
                ].join('\n');

                // 2. Dispatch Voucher Slip Image to all parties (Driver, Owner, Admin)
                const imageRecipients = new Map();
                if (cleanDriver) imageRecipients.set(cleanDriver, driverPhone);
                if (!isSelf && cleanOwner) imageRecipients.set(cleanOwner, ownerPhone);
                if (cleanAdmin) imageRecipients.set(cleanAdmin, adminPhone);

                for (const [cleanP, rawPhone] of imageRecipients.entries()) {
                    try {
                        if (voucherImageBuffer) {
                            await sendWhatsAppImage(rawPhone, voucherImageBuffer, voucherCaption, req);
                            console.log(`[WA-Hook] Voucher image slip sent to ${rawPhone}`);
                        } else {
                            const eventKey = cleanP === cleanDriver ? 'voucher_created_driver' : 'voucher_created_owner';
                            await sendEventNotification(eventKey, templateData, [rawPhone], req);
                            console.log(`[WA-Hook] Voucher text alert [${eventKey}] sent to ${rawPhone}`);
                        }
                    } catch (err) {
                        console.error(`[WA-Hook] Voucher alert to ${rawPhone} failed:`, err.message);
                        try {
                            const eventKey = cleanP === cleanDriver ? 'voucher_created_driver' : 'voucher_created_owner';
                            await sendEventNotification(eventKey, templateData, [rawPhone], req);
                        } catch (_) {}
                    }
                }

                // 3. If there is an online advance, ALSO send the action button message to the clerk/admin
                if (online > 0 && cleanAdmin) {
                    try {
                        await sendEventNotification('online_advance_clerk', templateData, [adminPhone], req);
                        console.log(`[WA-Hook] Online Advance Clerk alert sent to ${adminPhone}`);
                    } catch (clerkErr) {
                        console.error(`[WA-Hook] Clerk alert to ${adminPhone} failed:`, clerkErr.message);
                    }
                }

            } catch (waErr) {
                console.error('[WA-Hook] Voucher notify FAILED:', waErr.message);
            }
        })();

        const { backupVoucher } = require('../utils/realtimeBackup');
        backupVoucher({ ...savedBody, ...savedResult }, { brand: savedBody.brand, type: savedBody.type });
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

        if (req.body.paymentClearedDate) {
            const smsService = require('../utils/smsService');
            const whatsappService = require('../utils/whatsappService');
            const updated = await voucherService.getVoucherById(req.params.id, col);
            if (updated) {
                whatsappService.triggerEventWhatsApp('balance_paid', { ...updated, amount: updated.paidBalance }, req);
                smsService.triggerEventSms('balance_paid', { ...updated, amount: updated.paidBalance }, req);
            }
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
                    const { backupVoucher } = require('../utils/realtimeBackup');
                    await backupVoucher(updated, { brand: updated.brand, type: updated.type });
                } catch (e) {
                    console.error('[Backup-Hook] Voucher update sync failed:', e.message);
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

/**
 * POST /api/vouchers/remind-pending-advances
 * Manually trigger scanning and sending pending online advance reminders with interactive buttons.
 */
router.post('/remind-pending-advances', requireAuth, tenancyMiddleware, async (req, res, next) => {
    try {
        const { checkAndSendPendingOnlineAdvanceReminders } = require('../services/onlineAdvanceReminderService');
        const forceAll = req.body.forceAll === true;
        const result = await checkAndSendPendingOnlineAdvanceReminders({ forceAll });
        res.json(result);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
