/**
 * Offline Write Queue — IndexedDB-backed operation queue.
 *
 * When the user is offline and performs a write (POST/PATCH/DELETE),
 * the operation is stored here. When the user comes back online,
 * processSyncQueue() replays all queued operations in order.
 */

const DB_NAME = 'vgtc-offline-queue';
const STORE   = 'ops';
const DB_VER  = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'queueId', autoIncrement: true });
      }
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

export async function enqueue(op) {
  // op = { method, url, data, headers, label }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const entry = { ...op, queuedAt: new Date().toISOString() };
    const req   = store.add(entry);
    req.onsuccess = () => resolve({ ...entry, queueId: req.result });
    tx.onerror = reject;
  });
}

export async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = reject;
  });
}

export async function remove(queueId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(queueId);
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

export async function count() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = reject;
  });
}

/**
 * Replay all queued operations against the live API.
 * Returns { synced, failed } counts.
 */
export async function processSyncQueue(axInstance) {
  const ops = await getAll();
  if (!ops.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      await axInstance.request({
        method:  op.method,
        url:     op.url,
        data:    op.data,
        headers: op.headers || {},
      });
      await remove(op.queueId);
      synced++;
    } catch (err) {
      // Keep in queue on network failure; remove on client errors (4xx except 409 conflict)
      const status = err?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 409) {
        await remove(op.queueId); // hopeless — drop it
      }
      failed++;
    }
  }

  window.dispatchEvent(new CustomEvent('offline-queue-changed', { detail: { count: await count() } }));
  return { synced, failed };
}
