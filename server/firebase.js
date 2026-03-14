const admin = require('firebase-admin');

let db;
let isFirebaseInitialized = false;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Load from environment variable (Netlify)
        try {
            console.log('[Firebase] Attempting initialization via environment variable...');
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            db = admin.firestore();
            isFirebaseInitialized = true;
            console.log('[Firebase] Success: Connected to Firestore via environment variable');
        } catch (e) {
            console.error('[Firebase] Critical: Failed to parse FIREBASE_SERVICE_ACCOUNT. Ensure it is a valid JSON string.');
            throw e;
        }
    } else {
        // Load from local file (Local Dev)
        try {
            const path = require('path');
            const keyPath = path.join(__dirname, 'serviceAccountKey.json');
            const fs = require('fs');
            
            if (fs.existsSync(keyPath)) {
                const serviceAccount = require(keyPath);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                db = admin.firestore();
                isFirebaseInitialized = true;
                console.log('[Firebase] Success: Connected to Firestore via local serviceAccountKey.json');
            } else {
                console.warn('[Firebase] Warning: serviceAccountKey.json not found locally.');
                throw new Error('Local service account key missing');
            }
        } catch (e) {
            console.warn('[Firebase] Warning: Using local JSON fallback (Development Mode)');
            throw e;
        }
    }
} catch (error) {
    if (process.env.NETLIFY) {
        console.error('[Firebase] Serverless Error: Cannot initialize cloud database.');
        console.error('[Firebase] INSTRUCTIONS: Add your serviceAccountKey.json content to the "FIREBASE_SERVICE_ACCOUNT" environment variable in Netlify Site Settings.');
    }
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
