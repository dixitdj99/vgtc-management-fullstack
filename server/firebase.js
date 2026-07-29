const admin = require('firebase-admin');
const { isProduction } = require('./utils/envConfig');

let db;
let isFirebaseInitialized = false;

try {
    if (process.env.FIREBASE_CONFIG || process.env.FUNCTIONS_EMULATOR || (!process.env.FIREBASE_SERVICE_ACCOUNT && process.env.NODE_ENV === 'production')) {
        // Load using Default Application Credentials (GCP, App Hosting, Cloud Functions)
        try {
            console.log('[Firebase] Initializing via GCP Default Credentials...');
            admin.initializeApp();
            db = admin.firestore();
            isFirebaseInitialized = true;
            console.log('[Firebase] Success: Connected to Firestore via Default Credentials');
        } catch (e) {
            console.error('[Firebase] Critical: Failed to initialize via default credentials.');
            throw e;
        }
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
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

    // In production there is no safe fallback. The local JSON store lives on an
    // ephemeral container disk: writes would appear to succeed and then vanish on
    // the next restart, and would diverge between instances. Refuse to start
    // instead of silently accepting data we cannot keep.
    if (isProduction()) {
        console.error('[Firebase] FATAL: Firestore is unavailable in production. Refusing to start.');
        console.error('[Firebase] Reason:', error && error.message);
        console.error('[Firebase] Fix the service account credentials and redeploy. The local JSON');
        console.error('[Firebase] fallback is disabled in production because it loses data on restart.');
        process.exit(1);
    }

    // Local/beta only: fall through to the in-memory mock so the app can boot
    // without credentials. Services check isAvailable() and route to localStore.
    console.warn('[Firebase] Falling back to local JSON store (non-production environment only).');
    db = {
        collection: () => ({
            doc: () => ({ 
                set: () => Promise.resolve(), 
                get: () => Promise.resolve({ exists: false, data: () => null }), 
                update: () => Promise.resolve(), 
                delete: () => Promise.resolve() 
            }),
            add: () => Promise.resolve({ id: 'mock-id' }),
            orderBy: () => ({ 
                limit: () => ({ get: () => Promise.resolve({ docs: [] }) }),
                get: () => Promise.resolve({ docs: [] }) 
            }),
            where: () => ({ 
                orderBy: () => ({ 
                    limit: () => ({ get: () => Promise.resolve({ docs: [] }) }),
                    get: () => Promise.resolve({ docs: [] }) 
                }), 
                get: () => Promise.resolve({ docs: [] }) 
            })
        }),
        runTransaction: () => { console.error('Firestore not initialized'); return Promise.resolve(null); },
        batch: () => ({ 
            set: () => { }, 
            commit: () => Promise.resolve() 
        })
    };
}

const isAvailable = () => isFirebaseInitialized;

module.exports = { db, admin, isAvailable };
