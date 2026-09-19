const { db, isAvailable } = require('../firebase');
const { getCol, getEnvCol } = require('./collectionUtils');
const localStore = require('./localStore');

const BASE_COL = 'notifications';

/**
 * Creates an in-app system notification for the VGTC notification bell.
 */
async function createNotification({
    type = 'vehicle_loaded',
    title,
    message,
    lrNo = null,
    truckNo = '',
    loadingNo = null,
    source = '',
    destination = '',
    partyName = '',
    status = 'Loaded',
    metadata = {}
}, req = null) {
    try {
        const colName = req ? getCol(BASE_COL, req) : getEnvCol(BASE_COL);
        const record = {
            type,
            title: title || `Vehicle Loaded — LR #${lrNo || '—'}`,
            message: message || `Truck ${truckNo || '—'} is ${status}. Ready for dispatch.`,
            lrNo: lrNo !== null && lrNo !== undefined ? String(lrNo) : '',
            truckNo: truckNo || '',
            loadingNo: loadingNo !== null && loadingNo !== undefined ? String(loadingNo) : '',
            source: source || '',
            destination: destination || '',
            partyName: partyName || '',
            status: status || 'Loaded',
            read: false,
            createdAt: new Date().toISOString(),
            orgId: req?.orgId || 'vgtc',
            metadata: metadata || {}
        };

        if (isAvailable()) {
            const docRef = await db.collection(colName).add(record);
            return { id: docRef.id, ...record };
        } else {
            const saved = localStore.add(colName, record);
            return saved;
        }
    } catch (err) {
        console.error('[NotificationService] Error creating notification:', err.message);
        return null;
    }
}

/**
 * Fetch recent notifications (descending by createdAt).
 */
async function getNotifications(limitCount = 50, req = null) {
    try {
        const colName = req ? getCol(BASE_COL, req) : getEnvCol(BASE_COL);
        if (isAvailable()) {
            const snap = await db.collection(colName)
                .orderBy('createdAt', 'desc')
                .limit(limitCount)
                .get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            const docs = localStore.getAll(colName) || [];
            return docs
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .slice(0, limitCount);
        }
    } catch (err) {
        // If orderBy index is needed or missing, fallback to unordered get + client sort
        try {
            const colName = req ? getCol(BASE_COL, req) : getEnvCol(BASE_COL);
            if (isAvailable()) {
                const snap = await db.collection(colName).limit(limitCount * 2).get();
                return snap.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                    .slice(0, limitCount);
            }
        } catch (_) {}
        console.error('[NotificationService] Error fetching notifications:', err.message);
        return [];
    }
}

/**
 * Mark a single notification as read.
 */
async function markNotificationRead(id, req = null) {
    try {
        const colName = req ? getCol(BASE_COL, req) : getEnvCol(BASE_COL);
        if (isAvailable()) {
            await db.collection(colName).doc(id).update({ read: true });
        } else {
            localStore.update(colName, id, { read: true });
        }
        return true;
    } catch (err) {
        console.error(`[NotificationService] Error marking read for ${id}:`, err.message);
        return false;
    }
}

/**
 * Mark all notifications as read.
 */
async function markAllNotificationsRead(req = null) {
    try {
        const colName = req ? getCol(BASE_COL, req) : getEnvCol(BASE_COL);
        if (isAvailable()) {
            const snap = await db.collection(colName).where('read', '==', false).get();
            const batch = db.batch();
            snap.docs.forEach(doc => {
                batch.update(doc.ref, { read: true });
            });
            await batch.commit();
        } else {
            const docs = localStore.getAll(colName) || [];
            docs.forEach(d => {
                if (!d.read) localStore.update(colName, d.id, { read: true });
            });
        }
        return true;
    } catch (err) {
        console.error('[NotificationService] Error marking all read:', err.message);
        return false;
    }
}

/**
 * Delete a specific notification.
 */
async function deleteNotification(id, req = null) {
    try {
        const colName = req ? getCol(BASE_COL, req) : getEnvCol(BASE_COL);
        if (isAvailable()) {
            await db.collection(colName).doc(id).delete();
        } else {
            localStore.delete(colName, id);
        }
        return true;
    } catch (err) {
        console.error(`[NotificationService] Error deleting notification ${id}:`, err.message);
        return false;
    }
}

/**
 * Clear all notifications.
 */
async function clearAllNotifications(req = null) {
    try {
        const colName = req ? getCol(BASE_COL, req) : getEnvCol(BASE_COL);
        if (isAvailable()) {
            const snap = await db.collection(colName).limit(100).get();
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } else {
            localStore.clear(colName);
        }
        return true;
    } catch (err) {
        console.error('[NotificationService] Error clearing notifications:', err.message);
        return false;
    }
}

module.exports = {
    createNotification,
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications
};
