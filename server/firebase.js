const admin = require('firebase-admin');

// Service account will be loaded from a local file for development
// In a real environment, this would be an environment variable
let db;
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
} catch (error) {
    console.warn('Firebase Service Account not found. Firestore features will not work until serviceAccountKey.json is added.');
    // Mock db object to prevent immediate crashes in other files
    db = {
        collection: () => ({
            doc: () => ({ set: () => { }, get: () => ({ exists: false }), update: () => { } }),
            orderBy: () => ({ get: () => ({ docs: [] }) }),
            where: () => ({ orderBy: () => ({ get: () => ({ docs: [] }) }) })
        }),
        runTransaction: () => { console.error('Firestore not initialized'); return null; },
        batch: () => ({ set: () => { }, commit: () => { } })
    };
}

module.exports = { db, admin };
