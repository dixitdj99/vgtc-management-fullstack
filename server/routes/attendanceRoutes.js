const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');

const ATTENDANCE_COL = 'attendance';

// GET all attendance records — supports ?month=YYYY-MM and ?profileId=xxx
router.get('/', async (req, res) => {
    try {
        const { month, profileId } = req.query;
        let docs = [];

        if (!isAvailable()) {
            docs = localStore.getAll(ATTENDANCE_COL);
        } else {
            let query = db.collection(getCol(ATTENDANCE_COL, req));
            const snapshot = await query.get();
            docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Filter by month if provided (format: YYYY-MM)
        if (month) docs = docs.filter(d => (d.date || '').startsWith(month));
        // Filter by staff profile id
        if (profileId) docs = docs.filter(d => d.profileId === profileId);

        docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        res.json(docs);
    } catch (err) {
        console.error('get attendance error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST — mark attendance for a single staff member for a specific date
// Body: { profileId, profileName, date, status: 'present'|'absent'|'half_day'|'leave' }
router.post('/', async (req, res) => {
    try {
        const { profileId, date } = req.body;
        if (!profileId || !date) return res.status(400).json({ error: 'profileId and date are required' });

        const payload = {
            ...req.body,
            createdAt: new Date().toISOString(),
        };

        if (!isAvailable()) {
            // Check for existing record and update it
            const existing = localStore.getAll(ATTENDANCE_COL).find(d => d.profileId === profileId && d.date === date);
            if (existing) {
                localStore.update(ATTENDANCE_COL, existing.id, payload);
                return res.json({ id: existing.id, ...payload });
            }
            const doc = localStore.insert(ATTENDANCE_COL, payload);
            return res.json({ id: doc.id, ...payload });
        }

        // In Firestore, use a deterministic doc ID so duplicate marks simply overwrite
        const docId = `${profileId}_${date}`;
        await db.collection(getCol(ATTENDANCE_COL, req)).doc(docId).set(payload, { merge: true });
        res.json({ id: docId, ...payload });
    } catch (err) {
        console.error('add attendance error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST bulk — mark attendance for multiple staff in one request
// Body: { date, records: [{ profileId, profileName, status }] }
router.post('/bulk', async (req, res) => {
    try {
        const { date, records } = req.body;
        if (!date || !Array.isArray(records)) return res.status(400).json({ error: 'date and records[] are required' });

        const results = [];

        if (!isAvailable()) {
            for (const r of records) {
                const payload = { ...r, date, createdAt: new Date().toISOString() };
                const existing = localStore.getAll(ATTENDANCE_COL).find(d => d.profileId === r.profileId && d.date === date);
                if (existing) {
                    localStore.update(ATTENDANCE_COL, existing.id, payload);
                    results.push({ id: existing.id, ...payload });
                } else {
                    const doc = localStore.insert(ATTENDANCE_COL, payload);
                    results.push({ id: doc.id, ...payload });
                }
            }
        } else {
            const batch = db.batch();
            const col = getCol(ATTENDANCE_COL, req);
            for (const r of records) {
                const docId = `${r.profileId}_${date}`;
                const payload = { ...r, date, createdAt: new Date().toISOString() };
                batch.set(db.collection(col).doc(docId), payload, { merge: true });
                results.push({ id: docId, ...payload });
            }
            await batch.commit();
        }

        res.json({ saved: results.length, records: results });
    } catch (err) {
        console.error('bulk attendance error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE a specific attendance record
router.delete('/:id', async (req, res) => {
    try {
        if (!isAvailable()) {
            localStore.delete(ATTENDANCE_COL, req.params.id);
        } else {
            await db.collection(getCol(ATTENDANCE_COL, req)).doc(req.params.id).delete();
        }
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
