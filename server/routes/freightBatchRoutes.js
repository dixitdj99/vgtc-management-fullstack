/**
 * freightBatchRoutes.js — vehicle balances handed from a balance sheet to Pay.
 *
 * A batch is a record of WHICH TRIPS a clerk sent for payment. It deliberately
 * stores no money. Amounts and status are recomputed from the vouchers, whose
 * `paidBalance` / `paymentClearedDate` the balance sheets already read, so a
 * payment shows up on the sheet without anything having to be kept in sync.
 *
 * The one rule that cannot live in the client is the duplicate guard: the same
 * trip must never sit in two open batches, or it gets sent twice and paid
 * twice. Two clerks working two modules will do this by accident, so it is
 * enforced here on every create.
 */

const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const auditService = require('../services/auditService');

router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'freight_batches';
const VOUCHERS_COL = 'vouchers';

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

const readAll = async (req) => {
    if (!isAvailable()) {
        return localStore.getAll(BASE_COL).filter(d => d.orgId === req.orgId);
    }
    const snap = await db.collection(getCol(BASE_COL, req)).where('orgId', '==', req.orgId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/** Ids of vouchers already committed to a batch that has not been cancelled. */
const spokenFor = (batches) => {
    const taken = new Map();               // voucherId -> batch that holds it
    for (const b of batches) {
        if (b.cancelledAt) continue;
        for (const vid of b.voucherIds || []) taken.set(vid, b);
    }
    return taken;
};

/**
 * GET /api/freight-batches?open=1
 * `open=1` drops cancelled batches. Fully-paid ones are still returned — the
 * client decides what to show, since "paid" is derived from the vouchers and
 * the server does not read them here.
 */
router.get('/', async (req, res, next) => {
    try {
        let batches = await readAll(req);
        if (req.query.open === '1') batches = batches.filter(b => !b.cancelledAt);
        if (req.query.truckNo) batches = batches.filter(b => b.truckNo === req.query.truckNo);
        if (req.query.type) batches = batches.filter(b => b.type === req.query.type);
        batches.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        res.json(batches);
    } catch (err) { next(err); }
});

/**
 * POST /api/freight-batches
 * Body: { batches: [{ type, truckNo, voucherIds[], periodFrom, periodTo, note? }] }
 * One call sends a whole module's run, so a partial failure would leave the
 * clerk unsure what went over. Everything is validated before anything is
 * written, and the response reports what was skipped.
 */
router.post('/', async (req, res, next) => {
    try {
        const incoming = Array.isArray(req.body.batches) ? req.body.batches : [req.body];
        if (!incoming.length) return res.status(400).json({ error: 'batches[] is required' });

        const existing = await readAll(req);
        const taken = spokenFor(existing);

        const clean = [];
        const skipped = [];
        const seenHere = new Set();        // duplicates inside this same request

        for (const b of incoming) {
            if (!b.type) return res.status(400).json({ error: 'every batch needs a type' });
            if (!b.truckNo) return res.status(400).json({ error: 'every batch needs a truckNo' });
            if (!Array.isArray(b.voucherIds) || !b.voucherIds.length) {
                return res.status(400).json({ error: `no trips selected for ${b.truckNo}` });
            }
            if (b.periodFrom && !isDate(b.periodFrom)) return res.status(400).json({ error: 'periodFrom must be YYYY-MM-DD' });
            if (b.periodTo && !isDate(b.periodTo)) return res.status(400).json({ error: 'periodTo must be YYYY-MM-DD' });

            const fresh = [];
            for (const vid of b.voucherIds) {
                const held = taken.get(vid) || (seenHere.has(vid) ? { truckNo: b.truckNo } : null);
                if (held) {
                    skipped.push({ voucherId: vid, truckNo: b.truckNo, reason: 'already sent to Pay' });
                    continue;
                }
                seenHere.add(vid);
                fresh.push(vid);
            }
            // A truck whose trips were all sent already is not an error — the
            // clerk re-ran the month. Skip it and say so.
            if (!fresh.length) continue;

            clean.push({
                type: String(b.type),
                truckNo: String(b.truckNo),
                voucherIds: fresh,
                periodFrom: b.periodFrom || null,
                periodTo: b.periodTo || null,
                dueDate: isDate(b.dueDate) ? b.dueDate : null,
                note: b.note ? String(b.note).slice(0, 300) : null,
                orgId: req.orgId,
                createdBy: req.user?.id || null,
                createdByName: req.user?.name || null,
                createdAt: new Date().toISOString(),
                cancelledAt: null,
            });
        }

        if (!clean.length) {
            return res.status(409).json({
                error: 'Every selected trip has already been sent to Pay.',
                skipped,
            });
        }

        const created = [];
        if (!isAvailable()) {
            for (const c of clean) created.push(localStore.insert(BASE_COL, c));
        } else {
            const col = db.collection(getCol(BASE_COL, req));
            // Firestore caps a batch at 500 writes.
            for (let i = 0; i < clean.length; i += 400) {
                const wb = db.batch();
                for (const c of clean.slice(i, i + 400)) {
                    const ref = col.doc();
                    wb.set(ref, c);
                    created.push({ id: ref.id, ...c });
                }
                await wb.commit();
            }
        }

        auditService.logAction({
            orgId: req.orgId,
            action: 'FREIGHT_BATCH_SENT',
            performedBy: req.user?.id,
            performedByName: req.user?.name,
            targetId: created.map(c => c.id).join(','),
            targetType: 'freight_batch',
            before: null,
            after: {
                batches: created.length,
                trucks: [...new Set(created.map(c => c.truckNo))],
                types: [...new Set(created.map(c => c.type))],
                trips: created.reduce((s, c) => s + c.voucherIds.length, 0),
                skipped: skipped.length,
            },
        });

        res.status(201).json({ created, skipped });
    } catch (err) { next(err); }
});

/**
 * PATCH /api/freight-batches/:id — dueDate, note, or cancel.
 * Nothing else is writable: the trip list is what was handed over and changing
 * it after the fact would rewrite history the balance sheet is read against.
 */
router.patch('/:id', async (req, res, next) => {
    try {
        const update = {};
        if ('dueDate' in req.body) {
            if (req.body.dueDate && !isDate(req.body.dueDate)) {
                return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD' });
            }
            update.dueDate = req.body.dueDate || null;
        }
        if ('note' in req.body) update.note = req.body.note ? String(req.body.note).slice(0, 300) : null;
        if (req.body.cancel === true) update.cancelledAt = new Date().toISOString();
        if (req.body.cancel === false) update.cancelledAt = null;

        if (!Object.keys(update).length) {
            return res.status(400).json({ error: 'nothing to update — dueDate, note or cancel only' });
        }

        if (!isAvailable()) {
            const doc = localStore.getAll(BASE_COL).find(d => d.id === req.params.id && d.orgId === req.orgId);
            if (!doc) return res.status(404).json({ error: 'Batch not found' });
            localStore.update(BASE_COL, req.params.id, update);
        } else {
            const ref = db.collection(getCol(BASE_COL, req)).doc(req.params.id);
            const doc = await ref.get();
            if (!doc.exists || doc.data().orgId !== req.orgId) {
                return res.status(404).json({ error: 'Batch not found' });
            }
            await ref.update(update);
        }

        auditService.logAction({
            orgId: req.orgId,
            action: req.body.cancel === true ? 'FREIGHT_BATCH_CANCELLED' : 'FREIGHT_BATCH_UPDATED',
            performedBy: req.user?.id,
            performedByName: req.user?.name,
            targetId: req.params.id,
            targetType: 'freight_batch',
            before: null,
            after: update,
        });

        res.json({ id: req.params.id, ...update });
    } catch (err) { next(err); }
});

/**
 * PATCH /api/freight-batches/due-date — set one due date across a truck's open
 * batches. A merged payable is one row to the clerk, so its due date has to
 * land on every module it was assembled from.
 */
router.patch('/bulk/due-date', async (req, res, next) => {
    try {
        const { truckNo, dueDate } = req.body;
        if (!truckNo) return res.status(400).json({ error: 'truckNo is required' });
        if (dueDate && !isDate(dueDate)) return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD' });

        const targets = (await readAll(req)).filter(b => b.truckNo === truckNo && !b.cancelledAt);
        if (!targets.length) return res.status(404).json({ error: 'No open batches for that truck' });

        if (!isAvailable()) {
            targets.forEach(b => localStore.update(BASE_COL, b.id, { dueDate: dueDate || null }));
        } else {
            const col = db.collection(getCol(BASE_COL, req));
            const wb = db.batch();
            targets.forEach(b => wb.update(col.doc(b.id), { dueDate: dueDate || null }));
            await wb.commit();
        }

        res.json({ updated: targets.length, truckNo, dueDate: dueDate || null });
    } catch (err) { next(err); }
});

module.exports = router;
