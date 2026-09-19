const express = require('express');
const router = express.Router();
const svc = require('../utils/cashbookService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const { db, isAvailable } = require('../firebase');
const advanceService = require('../services/vehicleAdvanceService');
const { sendEventNotification, getWhatsAppConfig, lookupVehicleInfo, lookupProfilePhone } = require('../utils/whatsappService');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'jkl_cashbook';
const PAYMENTS_COL = 'profile_payments';
const ADVANCES_COL = 'vehicle_advances';

const sheetsService = require('../utils/sheetsService');

// Helper to resolve notification recipients for cashout
async function getCashoutPhones(req, entityType, entityId, entityName) {
    const waCfg = await getWhatsAppConfig(req);
    const phones = [waCfg.adminPhone || '8708032492'];

    // Look up profile contact number by ID or Name
    let profilePhone = null;
    if (entityId) profilePhone = await lookupProfilePhone(entityId, req);
    if (!profilePhone && entityName) profilePhone = await lookupProfilePhone(entityName, req);
    if (profilePhone) phones.push(profilePhone);

    if (entityType === 'vehicle' && entityId) {
        const vInfo = await lookupVehicleInfo(entityId, req);
        if (vInfo?.ownerContact) phones.push(vInfo.ownerContact);
        if (vInfo?.driverContact) phones.push(vInfo.driverContact);
    }
    return Array.from(new Set(phones.filter(Boolean)));
}

// GET  /api/jkl/cashbook
router.get('/', async (req, res) => {
    try {
        const data = await svc.getAll(req.orgId, getCol(BASE_COL, req));
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/jkl/cashbook/deposit
router.post('/deposit', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const doc = await svc.addEntry(req.orgId, 'deposit', amount, remark, date, getCol(BASE_COL, req));
        sheetsService.upsertCashbook(doc, 'jklakshmi').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));
        res.status(201).json(doc);

        // WhatsApp — notify admin of deposit
        ;(async () => {
            try {
                const waCfg = await getWhatsAppConfig(req);
                const phones = [waCfg.adminPhone || '8708032492'].filter(Boolean);
                await sendEventNotification('deposit', {
                    amount: parseFloat(amount || 0).toLocaleString('en-IN'),
                    remark: remark || '—',
                    date: date || new Date().toLocaleDateString('en-IN'),
                }, phones, req);
                console.log(`[WA-Hook] JKL deposit alert sent for Rs.${amount}`);
            } catch (e) { console.error('[WA-Hook] JKL deposit notify FAILED:', e.message); }
        })();
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/jkl/cashbook/cash-out
router.post('/cash-out', async (req, res) => {
    const { amount, remark, date, entityType, entityId, entityName } = req.body;
    try {
        const col = getCol(BASE_COL, req);
        const extraMeta = {
            entityType: entityType || 'expense',
            entityId: entityId || 'office_spend',
            entityName: entityName || 'Office Spend',
        };
        const doc = await svc.addEntry(req.orgId, 'cash_out', amount, remark, date, col, extraMeta);
        sheetsService.upsertCashbook(doc, 'jklakshmi').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));
        res.status(201).json(doc);

        // WhatsApp — notify admin and recipient of cashout
        ;(async () => {
            try {
                const phones = await getCashoutPhones(req, entityType, entityId, entityName);
                const tplData = {
                    entityName: entityName || 'Office Spend',
                    entityType: entityType || 'Expense',
                    amount: parseFloat(amount || 0).toLocaleString('en-IN'),
                    remark: remark || '—',
                    date: date || new Date().toLocaleDateString('en-IN'),
                };
                await sendEventNotification('cashout', tplData, phones, req);
                console.log(`[WA-Hook] JKL Cashout notification dispatched for ${tplData.entityName} (Rs.${tplData.amount})`);
            } catch (e) { console.error('[WA-Hook] JKL cashout notify FAILED:', e.message); }
        })();
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/jkl/cashbook/cash-out-linked
router.post('/cash-out-linked', async (req, res) => {
    const { amount, remark, date, entityType, entityId, entityName } = req.body;
    // A `custom` entity is someone not on the roster — a labourer, a mechanic —
    // so it carries a name and no id. Everything else must still be a real
    // record, or the cash-out links to nothing.
    if (!entityType) return res.status(400).json({ error: 'Entity required' });
    if (entityType === 'custom') {
        if (!String(entityName || '').trim()) return res.status(400).json({ error: 'Name required' });
    } else if (!entityId) {
        return res.status(400).json({ error: 'Entity required' });
    }
    try {
        const col = getCol(BASE_COL, req);
        const doc = await svc.addEntry(req.orgId, 'cash_out', amount, remark, date, col, {
            entityType, entityId, entityName: entityName || '',
        });

        if (entityType === 'driver' || entityType === 'staff') {
            const payCol = getCol(PAYMENTS_COL, req);
            const payload = {
                profileId: entityId, profileName: entityName || '',
                category: 'Advance', amount: parseFloat(amount),
                date: date || new Date().toISOString().slice(0, 10),
                remark: remark || 'Cash advance from cashbook',
                paymentMethod: 'Cash', orgId: req.orgId,
                cashbookEntryId: doc.id, createdAt: new Date().toISOString(),
            };
            if (isAvailable()) {
                const ref = await db.collection(payCol).add(payload);
                await svc.updateEntry(doc.id, { linkedPaymentId: ref.id }, col);
                doc.linkedPaymentId = ref.id;
            }
        } else if (entityType === 'vehicle') {
            const advCol = getCol(ADVANCES_COL, req);
            const result = await advanceService.createAdvance(req.orgId, {
                truckNo: entityId, type: 'debit', amount,
                date: date || new Date().toISOString().slice(0, 10),
                remark: remark || 'Cash advance from cashbook',
                cashbookEntryId: doc.id,
            }, advCol);
            await svc.updateEntry(doc.id, { linkedAdvanceId: result.id }, col);
            doc.linkedAdvanceId = result.id;
        }

        sheetsService.upsertCashbook(doc, 'jklakshmi').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));
        res.status(201).json(doc);

        // WhatsApp — notify admin and recipient of linked cashout
        ;(async () => {
            try {
                const phones = await getCashoutPhones(req, entityType, entityId, entityName);
                const tplData = {
                    entityName: entityName || 'N/A',
                    entityType: entityType || 'N/A',
                    amount: parseFloat(amount || 0).toLocaleString('en-IN'),
                    remark: remark || '—',
                    date: date || new Date().toLocaleDateString('en-IN'),
                };
                await sendEventNotification('cashout', tplData, phones, req);
                console.log(`[WA-Hook] JKL Linked cashout alert dispatched for ${tplData.entityName} (Rs.${tplData.amount})`);
            } catch (e) { console.error('[WA-Hook] JKL cashout-linked notify FAILED:', e.message); }
        })();
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/jkl/cashbook/:id/return
router.post('/:id/return', async (req, res) => {
    const { date, remark } = req.body;
    try {
        const col = getCol(BASE_COL, req);
        const original = await svc.getById(req.params.id, col);
        if (!original) return res.status(404).json({ error: 'Entry not found' });
        if (original.type !== 'cash_out') return res.status(400).json({ error: 'Only cash-out entries can be returned' });
        if (original.isReturned) return res.status(400).json({ error: 'Already returned' });

        const refundDoc = await svc.addEntry(req.orgId, 'deposit', original.amount, remark || 'Cash returned', date || new Date().toISOString().slice(0, 10), col, {
            isRefundEntry: true, originalEntryId: req.params.id,
        });

        await svc.updateEntry(req.params.id, { isReturned: true, returnEntryId: refundDoc.id }, col);

        if (original.linkedPaymentId) {
            try { await db.collection(getCol(PAYMENTS_COL, req)).doc(original.linkedPaymentId).delete(); } catch (_) {}
        }
        if (original.linkedAdvanceId) {
            try { await advanceService.deleteAdvance(original.linkedAdvanceId, getCol(ADVANCES_COL, req)); } catch (_) {}
        }

        res.json({ original: { ...original, isReturned: true, returnEntryId: refundDoc.id }, refund: refundDoc });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/jkl/cashbook/:id
router.delete('/:id', async (req, res) => {
    try {
        const all = await svc.getAll(req.orgId, getCol(BASE_COL, req));
        const entry = all.find(e => e.id === req.params.id);
        
        await svc.deleteEntry(req.params.id, getCol(BASE_COL, req));
        
        if (entry) {
            sheetsService.deleteCashbook(req.params.id, entry.type, 'jklakshmi').catch(err => console.error('[Backup Hook] Cashbook delete failed:', err.message));
        }
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
