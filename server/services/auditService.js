const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { getEnvCol } = require('../utils/collectionUtils');

const getACol = () => getEnvCol('audit_logs');

const ACTIONS = {
    USER_CREATED: 'USER_CREATED',
    USER_UPDATED: 'USER_UPDATED',
    USER_DELETED: 'USER_DELETED',
    ORG_UPDATED: 'ORG_UPDATED',
    PERMISSIONS_CHANGED: 'PERMISSIONS_CHANGED',
    ROLE_CHANGED: 'ROLE_CHANGED',
    MODULE_TOGGLED: 'MODULE_TOGGLED'
};

/**
 * Compute a shallow diff between two objects, returning only changed fields.
 */
const computeDiff = (before, after) => {
    const diff = {};
    const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const key of allKeys) {
        const b = before?.[key];
        const a = after?.[key];
        if (JSON.stringify(b) !== JSON.stringify(a)) {
            diff[key] = { before: b ?? null, after: a ?? null };
        }
    }
    return Object.keys(diff).length ? diff : null;
};

/**
 * Log an audit action.
 */
const logAction = async ({ orgId, action, performedBy, performedByName, targetId, targetType, before, after }) => {
    const entry = {
        orgId: orgId || 'vgtc',
        action,
        performedBy: performedBy || 'system',
        performedByName: performedByName || 'System',
        targetId: targetId || null,
        targetType: targetType || null,
        diff: computeDiff(before, after),
        timestamp: new Date().toISOString()
    };

    try {
        if (isAvailable()) {
            await db.collection(getACol()).add(entry);
        } else {
            localStore.insert(getACol(), entry);
        }
    } catch (err) {
        console.warn('[Audit] Failed to log action:', err.message);
    }
};

/**
 * Get paginated audit log for an org.
 */
const getLog = async (orgId, { limit = 30, offset = 0 } = {}) => {
    const col = getACol();
    let entries = [];

    if (isAvailable()) {
        let query = db.collection(col).where('orgId', '==', orgId).orderBy('timestamp', 'desc');
        // Firestore doesn't support offset natively — use limit and skip via cursor
        // For simplicity, fetch limit + offset and slice
        const snapshot = await query.limit(limit + offset).get();
        entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        entries = entries.slice(offset, offset + limit);
    } else {
        entries = localStore.getAll(col)
            .filter(e => e.orgId === orgId)
            .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
            .slice(offset, offset + limit);
    }

    return entries;
};

module.exports = { logAction, getLog, computeDiff, ACTIONS };
