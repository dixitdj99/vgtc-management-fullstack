const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const labourService = require('../utils/labourService');
const { SECRET, requireAdmin } = require('../middleware/auth');
const { db, isAvailable } = require('../firebase');
const { getEnvCol } = require('../utils/collectionUtils');
const { getEnvPrefix } = require('../utils/envConfig');
const localStore = require('../utils/localStore');

// ── Labour JWT Middleware ──────────────────────────────────
const requireLabourAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(auth.slice(7), SECRET);
        if (decoded.role !== 'labourer') return res.status(403).json({ error: 'Labour access only' });
        req.labourer = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// ── POST /api/labour/login ──────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

        const worker = await labourService.findByUsername(username);
        if (!worker || !labourService.verifyPassword(password, worker.password))
            return res.status(401).json({ error: 'Invalid username or password' });

        const token = jwt.sign(
            { id: worker.id, name: worker.name, username: worker.username, godown: worker.godown, role: 'labourer' },
            SECRET,
            { expiresIn: '30d' }
        );
        res.json({ token, worker: { id: worker.id, name: worker.name, godown: worker.godown } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ADMIN: Manage Labour Workers ───────────────────────────
// GET /api/labour/workers   (admin only)
router.get('/workers', requireAdmin, async (req, res) => {
    try {
        const workers = await labourService.getAll();
        res.json(workers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/labour/workers  (admin only)
router.post('/workers', requireAdmin, async (req, res) => {
    try {
        const worker = await labourService.create(req.body);
        res.status(201).json(worker);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PATCH /api/labour/workers/:id  (admin only)
router.patch('/workers/:id', requireAdmin, async (req, res) => {
    try {
        await labourService.update(req.params.id, req.body);
        res.json({ message: 'Worker updated' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /api/labour/workers/:id  (admin only)
router.delete('/workers/:id', requireAdmin, async (req, res) => {
    try {
        await labourService.remove(req.params.id);
        res.json({ message: 'Worker deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── LABOUR: Get today's LRs for assigned godown ─────────────
// GET /api/labour/today  (labour auth)
router.get('/today', requireLabourAuth, async (req, res) => {
    try {
        const { godown } = req.labourer;

        // Map godown → Firestore collection
        const colMap = {
            kosli: 'kosli_loading_receipts',
            jhajjar: 'jhajjar_loading_receipts',
            jkl: 'jkl_loading_receipts',
            dump: 'loading_receipts',
        };
        const basCol = colMap[godown];
        if (!basCol) return res.status(400).json({ error: `Unknown godown: ${godown}` });

        // Build prefix-aware collection name
        const prefix = getEnvPrefix();
        const fullCol = prefix ? `${prefix}${basCol}` : basCol;

        const todayStr = new Date().toISOString().split('T')[0];
        const targetDate = req.query.date || todayStr;

        let records = [];
        if (isAvailable()) {
            const snap = await db.collection(fullCol)
                .where('date', '>=', targetDate)
                .where('date', '<=', targetDate + '\uf8ff')
                .get();
            // Deduplicate by lrNo
            const map = new Map();
            snap.docs.forEach(doc => {
                const d = { id: doc.id, ...doc.data() };
                if (!map.has(d.lrNo)) {
                    map.set(d.lrNo, {
                        ...d,
                        _materials: [{
                            material: d.material,
                            bags: parseInt(d.totalBags) || 0,
                            challanNo: d.billing || 'N/A',
                            partyName: d.partyName || '—'
                        }]
                    });
                } else {
                    const existing = map.get(d.lrNo);
                    if (!existing.note && d.note) existing.note = d.note;
                    if (!existing.voiceMessageBase64 && d.voiceMessageBase64) existing.voiceMessageBase64 = d.voiceMessageBase64;
                    if (!existing.loadingType && d.loadingType) existing.loadingType = d.loadingType;
                    if (!existing.voiceHeard && d.voiceHeard) {
                        existing.voiceHeard = true;
                        existing.voiceHeardBy = d.voiceHeardBy;
                    }
                    existing._materials.push({
                        material: d.material,
                        bags: parseInt(d.totalBags) || 0,
                        challanNo: d.billing || 'N/A',
                        partyName: d.partyName || '—'
                    });
                    map.set(d.lrNo, existing);
                }
            });
            records = Array.from(map.values());
        } else {
            const all = localStore.getAll(fullCol);
            const todayData = all.filter(r => (r.date || '').startsWith(targetDate));
            const map = new Map();
            todayData.forEach(d => {
                if (!map.has(d.lrNo)) {
                    map.set(d.lrNo, {
                        ...d,
                        _materials: [{
                            material: d.material,
                            bags: parseInt(d.totalBags) || 0,
                            challanNo: d.billing || 'N/A',
                            partyName: d.partyName || '—'
                        }]
                    });
                } else {
                    const existing = map.get(d.lrNo);
                    if (!existing.note && d.note) existing.note = d.note;
                    if (!existing.voiceMessageBase64 && d.voiceMessageBase64) existing.voiceMessageBase64 = d.voiceMessageBase64;
                    if (!existing.loadingType && d.loadingType) existing.loadingType = d.loadingType;
                    existing._materials.push({
                        material: d.material,
                        bags: parseInt(d.totalBags) || 0,
                        challanNo: d.billing || 'N/A',
                        partyName: d.partyName || '—'
                    });
                }
            });
            records = Array.from(map.values());
        }

        // Natural sort by lrNo (handles numeric and alphabetic parts)
        records.sort((a, b) => {
            const aVal = String(a.lrNo || '');
            const bVal = String(b.lrNo || '');
            return aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.json(records);
    } catch (err) {
        console.error('[Labour] today fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── LABOUR: Mark voice as heard ─────────────────────────────
// PATCH /api/labour/lr/:godown/:id/heard  (labour auth)
router.patch('/lr/:godown/:id/heard', requireLabourAuth, async (req, res) => {
    try {
        const { godown, id } = req.params;

        // Verify the labourer is patching their own godown's LR
        if (req.labourer.godown !== godown)
            return res.status(403).json({ error: 'Access denied: wrong godown' });

        const colMap = {
            kosli: 'kosli_loading_receipts',
            jhajjar: 'jhajjar_loading_receipts',
            jkl: 'jkl_loading_receipts',
            dump: 'loading_receipts',
        };
        const basCol = colMap[godown];

        const prefix = getEnvPrefix();
        const fullCol = prefix ? `${prefix}${basCol}` : basCol;

        const heardAt = new Date().toISOString();
        const heardBy = req.labourer.name;

        if (isAvailable()) {
            await db.collection(fullCol).doc(id).update({ voiceHeard: true, voiceHeardAt: heardAt, voiceHeardBy: heardBy });
        } else {
            localStore.update(fullCol, id, { voiceHeard: true, voiceHeardAt: heardAt, voiceHeardBy: heardBy });
        }

        res.json({ message: 'Marked as heard', heardAt, heardBy });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── LABOUR: Update Status (started/loaded) ────────────────
// PATCH /api/labour/lr/:godown/:id/status  (labour auth)
router.patch('/lr/:godown/:id/status', requireLabourAuth, async (req, res) => {
    try {
        const { godown, id } = req.params;
        const { status } = req.body;

        if (req.labourer.godown !== godown)
            return res.status(403).json({ error: 'Access denied: wrong godown' });

        const colMap = {
            kosli: 'kosli_loading_receipts',
            jhajjar: 'jhajjar_loading_receipts',
            jkl: 'jkl_loading_receipts',
            dump: 'loading_receipts',
        };
        const basCol = colMap[godown];

        const prefix = getEnvPrefix();
        const fullCol = prefix ? `${prefix}${basCol}` : basCol;

        const update = { status };
        if (status === 'Started') update.startedAt = new Date().toISOString();
        if (status === 'Loaded') update.loadedAt = new Date().toISOString();

        if (isAvailable()) {
            await db.collection(fullCol).doc(id).update(update);
        } else {
            localStore.update(fullCol, id, update);
        }

        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
