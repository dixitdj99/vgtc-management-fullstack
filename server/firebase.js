const admin = require('firebase-admin');

let db;
let isFirebaseInitialized = false;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Load from environment variable (Netlify)
        console.log('[Firebase] Attempting initialization via environment variable...');
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        isFirebaseInitialized = true;
        console.log('[Firebase] Success: Connected to Firestore via environment variable');
    } else {
        // Load from local file (Local Dev)
        try {
            const serviceAccount = require('./serviceAccountKey.json');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            db = admin.firestore();
            isFirebaseInitialized = true;
            console.log('[Firebase] Success: Connected to Firestore via local serviceAccountKey.json');
        } catch (e) {
            console.warn('[Firebase] Warning: serviceAccountKey.json not found or invalid.');
            throw e;
        }
    }
} catch (error) {
    console.error('[Firebase] Critical: Initialization failed. Falling back to local JSON.', error.message);
    // ... rest of mock db
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
