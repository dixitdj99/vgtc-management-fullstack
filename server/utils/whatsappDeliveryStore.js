const crypto = require('crypto');
const { db, isAvailable } = require('../firebase');
const { getEnvCol } = require('./collectionUtils');
const localStore = require('./localStore');

const COLLECTION = 'whatsapp_deliveries';
const RANK = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

function documentId(messageId) {
  return crypto.createHash('sha256').update(String(messageId)).digest('hex');
}

async function mergeDelivery(messageId, patch, rank) {
  if (!messageId) return null;
  const id = documentId(messageId);
  const updatedAt = new Date().toISOString();
  const merge = current => {
    const next = { ...current, id, messageId, ...patch, updatedAt };
    if (current?.status && RANK[current.status] > rank) {
      next.status = current.status;
      next.statusUpdatedAt = current.statusUpdatedAt;
      next.errorCode = current.errorCode || null;
      next.error = current.error || null;
    }
    return next;
  };
  if (!isAvailable()) {
    const next = merge(localStore.getById(COLLECTION, id));
    localStore.upsert(COLLECTION, id, next);
    return next;
  }
  const ref = db.collection(getEnvCol(COLLECTION)).doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const next = merge(snapshot.exists ? snapshot.data() : null);
    transaction.set(ref, next);
    return next;
  });
}

async function recordAccepted(messageId, { phone = '', category = '', title = '' } = {}) {
  return mergeDelivery(messageId, {
    phone, category, title,
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString()
  }, RANK.accepted);
}

async function recordStatus(delivery) {
  const status = String(delivery?.status || 'unknown');
  const metaError = delivery?.errors?.[0];
  const statusUpdatedAt = delivery?.timestamp && /^\d+$/.test(String(delivery.timestamp))
    ? new Date(Number(delivery.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  return mergeDelivery(delivery?.id, {
    ...(delivery?.recipient_id ? { phone: delivery.recipient_id } : {}),
    status,
    statusUpdatedAt,
    errorCode: metaError?.code || null,
    error: metaError?.error_data?.details || metaError?.message || metaError?.title || null
  }, RANK[status] ?? 0);
}

async function getDelivery(messageId) {
  if (!messageId) return null;
  const id = documentId(messageId);
  if (!isAvailable()) return localStore.getById(COLLECTION, id);
  const snapshot = await db.collection(getEnvCol(COLLECTION)).doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function getRecentDeliveries(limit = 50) {
  const count = Math.min(Math.max(Number(limit) || 50, 1), 100);
  if (!isAvailable()) {
    return localStore.getAll(COLLECTION).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, count);
  }
  const snapshot = await db.collection(getEnvCol(COLLECTION)).orderBy('updatedAt', 'desc').limit(count).get();
  return snapshot.docs.map(doc => doc.data());
}

module.exports = { recordAccepted, recordStatus, getDelivery, getRecentDeliveries };
