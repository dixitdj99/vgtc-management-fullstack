/**
 * ewbStore.js — persistence for synced e-way bills.
 *
 * One document per e-way bill number per org, and `ewbNo` is the whole point:
 * the sync runs every half hour over the same day, so without a stable key the
 * operator would watch the same load pile up as a new draft every thirty
 * minutes. That would be worse than typing it.
 *
 * Status moves pending -> used (a challan was created) or -> ignored (not ours,
 * or handled on paper). Only pending ones are offered.
 */

const localStore = require('./localStore');
const { db, admin, isAvailable } = require('../firebase');

const firebaseAvailable = () => isAvailable();

/** Namespaced by org so two tenants cannot collide on a bill number. */
const docId = (orgId, ewbNo) => `${orgId}__${String(ewbNo)}`;

/**
 * Writes a bill, leaving an operator's decision alone.
 *
 * A resync must refresh the details — Part-B vehicle arrives later, and the
 * plant can correct a bill — but must never drag a `used` or `ignored` bill
 * back to `pending`. So `status` and `challanId` are only set on first write.
 *
 * @returns {{created: boolean}}
 */
async function upsertBill(orgId, bill, col) {
    const id = docId(orgId, bill.ewbNo);
    const fresh = { ...bill, orgId, ewbNo: String(bill.ewbNo), syncedAt: new Date().toISOString() };

    if (firebaseAvailable()) {
        const ref = db.collection(col).doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            await ref.set({
                ...fresh, status: 'pending', challanId: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { created: true };
        }
        await ref.set(fresh, { merge: true });
        return { created: false };
    }

    const existing = localStore.getById(col, id);
    localStore.upsert(col, id, existing ? fresh : { ...fresh, status: 'pending', challanId: null });
    return { created: !existing };
}

async function listBills(orgId, col, status = null) {
    let docs;
    if (firebaseAvailable()) {
        const snap = await db.collection(col).where('orgId', '==', orgId).get();
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        docs = localStore.getAll(col).filter(d => d.orgId === orgId);
    }
    if (status) docs = docs.filter(d => d.status === status);
    // Newest bill first — the load that just left the plant is the one being asked about.
    return docs.sort((a, b) => String(b.ewbDate || b.syncedAt || '').localeCompare(String(a.ewbDate || a.syncedAt || '')));
}

/** @param {'pending'|'used'|'ignored'} status */
async function setStatus(orgId, ewbNo, status, col, challanId = null) {
    const id = docId(orgId, ewbNo);
    const patch = { status, challanId, decidedAt: new Date().toISOString() };
    if (firebaseAvailable()) {
        const ref = db.collection(col).doc(id);
        if (!(await ref.get()).exists) throw new Error(`E-way bill ${ewbNo} has not been synced`);
        await ref.set(patch, { merge: true });
        return { id, ...patch };
    }
    if (!localStore.getById(col, id)) throw new Error(`E-way bill ${ewbNo} has not been synced`);
    return localStore.update(col, id, patch);
}

/* ── Sync state ───────────────────────────────────────────────────────────────
 * One record per org so the UI can say when the feed last ran and why it failed,
 * rather than showing an empty list that looks the same as "no loads today".
 */

const STATE_COL = 'eway_sync_state';

async function readState(orgId, col = STATE_COL) {
    if (firebaseAvailable()) {
        const snap = await db.collection(col).doc(orgId).get();
        return snap.exists ? snap.data() : null;
    }
    return localStore.getById(col, orgId);
}

async function writeState(orgId, state, col = STATE_COL) {
    if (firebaseAvailable()) {
        await db.collection(col).doc(orgId).set(state, { merge: true });
        return state;
    }
    return localStore.upsert(col, orgId, state);
}

module.exports = { upsertBill, listBills, setStatus, readState, writeState, docId, STATE_COL };
