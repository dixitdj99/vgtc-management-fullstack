const express = require('express');
const router = express.Router();
const svc = require('../utils/cashbookService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const { db, isAvailable } = require('../firebase');
const advanceService = require('../services/vehicleAdvanceService');
const {
    sendEventNotification,
    sendWhatsAppButtons,
    sendWhatsAppMessage,
    broadcastToAdmins,
    getWhatsAppConfig,
    lookupVehicleInfo,
    lookupProfilePhone
} = require('../utils/whatsappService');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);
const BASE_COL = 'cashbook';
const PAYMENTS_COL = 'profile_payments';
const ADVANCES_COL = 'vehicle_advances';

const sheetsService = require('../utils/sheetsService');

// Helper to calculate current running cashbook balance
async function getCashbookRunningBalance(orgId, req) {
    try {
        const all = await svc.getAll(orgId, getCol(BASE_COL, req));
        let bal = 0;
        for (const item of all) {
            const amt = parseFloat(item.amount) || 0;
            if (item.type === 'deposit') bal += amt;
            else if (item.type === 'cash_out') bal -= amt;
        }
        return bal;
    } catch (_) {
        return 0;
    }
}

// Helper to get staff monthly salary and remaining balance
async function getStaffBalanceInfo(profileIdOrName, orgId, req) {
    let profile = null;
    let totalAdvances = 0;
    let monthlySalary = 0;

    try {
        const pCol = getCol('profiles', req);
        let profiles = [];
        if (!isAvailable()) {
            profiles = localStore.getAll('profiles').filter(d => d.orgId === orgId);
        } else {
            const snap = await db.collection(pCol).where('orgId', '==', orgId).get();
            profiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        const searchStr = String(profileIdOrName || '').trim().toUpperCase();
        profile = profiles.find(p => String(p.id || '').trim().toUpperCase() === searchStr || String(p.name || p.profileName || '').trim().toUpperCase() === searchStr);
        if (profile) {
            monthlySalary = parseFloat(profile.salary || profile.monthlySalary || profile.baseSalary || 0);
        }

        const payCol = getCol(PAYMENTS_COL, req);
        let payments = [];
        if (!isAvailable()) {
            payments = localStore.getAll(PAYMENTS_COL).filter(d => d.orgId === orgId);
        } else {
            const snap = await db.collection(payCol).where('orgId', '==', orgId).get();
            payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        const staffPays = payments.filter(p => (profile && p.profileId === profile.id) || String(p.profileName || '').trim().toUpperCase() === searchStr);
        for (const p of staffPays) {
            totalAdvances += parseFloat(p.amount) || 0;
        }
    } catch (_) {}

    const remainingPay = Math.max(0, monthlySalary - totalAdvances);
    return {
        profile,
        monthlySalary,
        totalAdvances,
        remainingPay
    };
}

// Helper to resolve notification recipients for cashout
async function getCashoutPhones(req, entityType, entityId, entityName) {
    const waCfg = await getWhatsAppConfig(req);
    const phones = [...(waCfg.adminPhones || [waCfg.adminPhone || '8708032492'])];

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

// GET  /api/cashbook
router.get('/', async (req, res) => {
    try {
        const data = await svc.getAll(req.orgId, getCol(BASE_COL, req));
        
        // Fetch advances and payments to determine clearance status
        let advances = [];
        let payments = [];
        if (!isAvailable()) {
            advances = localStore.getAll(ADVANCES_COL).filter(d => d.orgId === req.orgId);
            payments = localStore.getAll(PAYMENTS_COL).filter(d => d.orgId === req.orgId);
        } else {
            const advSnap = await db.collection(getCol(ADVANCES_COL, req)).where('orgId', '==', req.orgId).get();
            advances = advSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const paySnap = await db.collection(getCol(PAYMENTS_COL, req)).where('orgId', '==', req.orgId).get();
            payments = paySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        const clearedAdvances = new Set(advances.filter(a => a.isCleared).map(a => a.id));
        const clearedPayments = new Set(payments.filter(p => p.isCleared).map(p => p.id));
        
        const clearedCbEntriesFromAdv = new Set(advances.filter(a => a.isCleared && a.cashbookEntryId).map(a => a.cashbookEntryId));
        const clearedCbEntriesFromPay = new Set(payments.filter(p => p.isCleared && p.cashbookEntryId).map(p => p.cashbookEntryId));

        const enriched = data.map(entry => {
            let isCleared = false;
            if (entry.linkedAdvanceId && clearedAdvances.has(entry.linkedAdvanceId)) {
                isCleared = true;
            } else if (entry.linkedPaymentId && clearedPayments.has(entry.linkedPaymentId)) {
                isCleared = true;
            } else if (clearedCbEntriesFromAdv.has(entry.id) || clearedCbEntriesFromPay.has(entry.id)) {
                isCleared = true;
            }
            return { ...entry, isCleared };
        });

        res.json(enriched);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cashbook/deposit
router.post('/deposit', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const numAmt = parseFloat(amount || 0);
        const doc = await svc.addEntry(req.orgId, 'deposit', amount, remark, date, getCol(BASE_COL, req));
        sheetsService.upsertCashbook(doc, 'jksuper').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));

        res.status(201).json(doc);

        // WhatsApp — broadcast deposit with balance to all Admins
        ;(async () => {
            try {
                const newBal = await getCashbookRunningBalance(req.orgId, req);
                const prevBal = newBal - numAmt;
                const depositMsg = [
                    `*VIKAS GOODS TRANSPORT CO.* 💰`,
                    `*Deposit Received in Cashbook*`,
                    ``,
                    `• *Amount:* Rs.${numAmt.toLocaleString('en-IN')}`,
                    `• *Date:* ${date || new Date().toLocaleDateString('en-IN')}`,
                    `• *Remark:* ${remark || '—'}`,
                    `• *Previous Balance:* Rs.${Math.round(prevBal).toLocaleString('en-IN')}`,
                    `• *New Cashbook Balance:* *Rs.${Math.round(newBal).toLocaleString('en-IN')}*`
                ].join('\n');

                await broadcastToAdmins('DEPOSIT ALERT', depositMsg, null, req);
                console.log(`[WA-Hook] Deposit broadcast sent to admins (New Balance: Rs.${newBal})`);
            } catch (e) { console.error('[WA-Hook] deposit notify FAILED:', e.message); }
        })();
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/cashbook/cash-out
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
        sheetsService.upsertCashbook(doc, 'jksuper').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));

        res.status(201).json(doc);

        // WhatsApp — notify admin and recipient, check low balance
        ;(async () => {
            try {
                const numAmt = parseFloat(amount || 0);
                const newBal = await getCashbookRunningBalance(req.orgId, req);

                // 1. Low Balance alert if balance drops below Rs.5000
                if (newBal < 5000) {
                    const lowBalMsg = [
                        `*VIKAS GOODS TRANSPORT CO.* ⚠️`,
                        `*LOW CASHBOOK BALANCE ALERT*`,
                        ``,
                        `Current Cashbook balance is *Rs.${Math.round(newBal).toLocaleString('en-IN')}* (Below Rs.5,000 threshold).`,
                        `👉 Please deposit funds to maintain operational cash balance.`
                    ].join('\n');
                    await broadcastToAdmins('LOW BALANCE ALERT', lowBalMsg, null, req);
                }

                const phones = await getCashoutPhones(req, entityType, entityId, entityName);
                const tplData = {
                    entityName: entityName || 'Office Spend',
                    entityType: entityType || 'Expense',
                    amount: numAmt.toLocaleString('en-IN'),
                    remark: remark || '—',
                    date: date || new Date().toLocaleDateString('en-IN'),
                };
                await sendEventNotification('cashout', tplData, phones, req);
                console.log(`[WA-Hook] Cashout notification dispatched for ${tplData.entityName} (Rs.${tplData.amount})`);
            } catch (e) { console.error('[WA-Hook] cashout notify FAILED:', e.message); }
        })();
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/cashbook/cash-out-linked — cash out with entity linking
router.post('/cash-out-linked', async (req, res) => {
    const { amount, remark, date, entityType, entityId, entityName } = req.body;
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

        // Create linked deduction
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

        sheetsService.upsertCashbook(doc, 'jksuper').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));

        res.status(201).json(doc);

        // WhatsApp — notify admins & send interactive confirmation to staff
        ;(async () => {
            try {
                const numAmt = parseFloat(amount || 0);
                const newBal = await getCashbookRunningBalance(req.orgId, req);

                // 1. Low Balance Alert if balance < Rs.5000
                if (newBal < 5000) {
                    const lowBalMsg = [
                        `*VIKAS GOODS TRANSPORT CO.* ⚠️`,
                        `*LOW CASHBOOK BALANCE ALERT*`,
                        ``,
                        `Current Cashbook balance is *Rs.${Math.round(newBal).toLocaleString('en-IN')}* (Below Rs.5,000 threshold).`,
                        `👉 Please deposit funds to maintain operational cash balance.`
                    ].join('\n');
                    await broadcastToAdmins('LOW BALANCE ALERT', lowBalMsg, null, req);
                }

                // 2. If entityType is staff, send interactive prompt to staff phone with confirm/decline buttons
                if (entityType === 'staff') {
                    const staffPhone = await lookupProfilePhone(entityId || entityName, req);
                    if (staffPhone) {
                        const staffBal = await getStaffBalanceInfo(entityId || entityName, req.orgId, req);
                        const staffPromptText = [
                            `*VIKAS GOODS TRANSPORT CO.* 💸`,
                            `*Cash Advance / Cashout Issued*`,
                            ``,
                            `Dear *${entityName || 'Staff'}*,`,
                            `An amount of *Rs.${numAmt.toLocaleString('en-IN')}* has been issued to you from Cashbook.`,
                            ``,
                            `• *Date:* ${date || new Date().toLocaleDateString('en-IN')}`,
                            `• *Remark:* ${remark || 'Cash Advance'}`,
                            `• *Advance Deducted:* Rs.${numAmt.toLocaleString('en-IN')}`,
                            `• *Total Advances Taken:* Rs.${Math.round(staffBal.totalAdvances).toLocaleString('en-IN')}`,
                            `• *Remaining Net Pay:* *Rs.${Math.round(staffBal.remainingPay).toLocaleString('en-IN')}*`,
                            ``,
                            `_Please confirm whether you received this cash advance:_`
                        ].join('\n');

                        const staffButtons = [
                            { id: `STAFF_CONFIRM_CASHOUT_${doc.id}`, text: '✅ Confirm Cashout' },
                            { id: `STAFF_DECLINE_CASHOUT_${doc.id}`, text: '❌ Decline / Dispute' }
                        ];

                        await sendWhatsAppButtons(staffPhone, 'ACTION REQUIRED', staffPromptText, staffButtons, req);
                        console.log(`[WA-Hook] Interactive staff cashout prompt sent to ${staffPhone}`);
                    }
                }

                // 3. Notify Admins of the cashout
                const adminMsg = [
                    `*VIKAS GOODS TRANSPORT CO.* 💸`,
                    `*Cashout Issued from Cashbook*`,
                    ``,
                    `• *Recipient:* ${entityName || 'N/A'} (${entityType || 'N/A'})`,
                    `• *Amount:* Rs.${numAmt.toLocaleString('en-IN')}`,
                    `• *Date:* ${date || new Date().toLocaleDateString('en-IN')}`,
                    `• *Remark:* ${remark || '—'}`,
                    `• *Remaining Cashbook Balance:* Rs.${Math.round(newBal).toLocaleString('en-IN')}`
                ].join('\n');
                await broadcastToAdmins('CASHOUT ALERT', adminMsg, null, req);

            } catch (e) { console.error('[WA-Hook] cashout-linked notify FAILED:', e.message); }
        })();
    } catch (e) { res.status(400).json({ error: e.message }); }
});


// POST /api/cashbook/:id/return — mark cash-out as returned
router.post('/:id/return', async (req, res) => {
    const { date, remark } = req.body;
    try {
        const col = getCol(BASE_COL, req);
        const original = await svc.getById(req.params.id, col);
        if (!original) return res.status(404).json({ error: 'Entry not found' });
        if (original.type !== 'cash_out') return res.status(400).json({ error: 'Only cash-out entries can be returned' });
        if (original.isReturned) return res.status(400).json({ error: 'Already returned' });

        // Create refund deposit entry
        const refundDoc = await svc.addEntry(req.orgId, 'deposit', original.amount, remark || 'Cash returned', date || new Date().toISOString().slice(0, 10), col, {
            isRefundEntry: true, originalEntryId: req.params.id,
        });

        // Mark original as returned
        await svc.updateEntry(req.params.id, { isReturned: true, returnEntryId: refundDoc.id }, col);

        // Reverse linked deduction
        if (original.linkedPaymentId) {
            try { await db.collection(getCol(PAYMENTS_COL, req)).doc(original.linkedPaymentId).delete(); } catch (_) {}
        }
        if (original.linkedAdvanceId) {
            try { await advanceService.deleteAdvance(original.linkedAdvanceId, getCol(ADVANCES_COL, req)); } catch (_) {}
        }

        res.json({ original: { ...original, isReturned: true, returnEntryId: refundDoc.id }, refund: refundDoc });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/cashbook/:id
router.delete('/:id', async (req, res) => {
    try {
        const all = await svc.getAll(req.orgId, getCol(BASE_COL, req));
        const entry = all.find(e => e.id === req.params.id);
        
        await svc.deleteEntry(req.params.id, getCol(BASE_COL, req));
        
        if (entry) {
            sheetsService.deleteCashbook(req.params.id, entry.type, 'jksuper').catch(err => console.error('[Backup Hook] Cashbook delete failed:', err.message));
        }
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
