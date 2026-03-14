const admin = require('firebase-admin');

let db;
let isFirebaseInitialized = false;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Load from environment variable (Netlify)
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        isFirebaseInitialized = true;
        console.log('[Firebase] Initialized via environment variable');
    } else {
        // Load from local file (Local Dev)
        const serviceAccount = require('./serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        isFirebaseInitialized = true;
        console.log('[Firebase] Initialized via local serviceAccountKey.json');
    }
} catch (error) {
    console.warn('[Firebase] Initialization failed. Falling back to mock (local JSON).', error.message);
    db = {
        collection: () => ({
            doc: () => ({ set: () => { }, get: () => ({ exists: false, data: () => null }), update: () => { }, delete: () => { } }),
            orderBy: () => ({ get: () => ({ docs: [] }) }),
            where: () => ({ orderBy: () => ({ get: () => ({ docs: [] }) }), get: () => ({ docs: [] }) })
        }),
        runTransaction: () => { console.error('Firestore not initialized'); return null; },
        batch: () => ({ set: () => { }, commit: () => { } })
    };
}

const isAvailable = () => isFirebaseInitialized;

module.exports = { db, admin, isAvailable };
