/**
 * localStore.js — simple JSON file-based store for when Firebase is not connected.
 * Each collection is stored as a separate JSON file in server/data/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const IS_LAMBDA = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.AWS_EXECUTION_ENV || process.env.LAMBDA_TASK_ROOT);
const DATA_DIR = IS_LAMBDA
    ? '/tmp/vgtc-data'
    : path.join(__dirname, '..', 'data');

console.log(`[localStore] Init: environment=${IS_LAMBDA ? 'serverless' : 'local'}, path=${DATA_DIR}`);

function ensureDir() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log(`[localStore] Created directory: ${DATA_DIR}`);
        }
    } catch (e) {
        // Only log if it's not a read-only error we expect on serverless
        if (!IS_LAMBDA) console.warn('[localStore] Directory error:', e.message);
    }
}

function readCollection(name) {
    const file = path.join(DATA_DIR, name + '.json');
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return []; }
}

function writeCollection(name, docs) {
    ensureDir();
    const file = path.join(DATA_DIR, name + '.json');
    try {
        fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf8');
    } catch (e) {
        if (!IS_LAMBDA) console.error('[localStore] Write failed:', e.message);
    }
}

const localStore = {
    getAll(collection) {
        return readCollection(collection);
    },

    getById(collection, id) {
        return readCollection(collection).find(d => d.id === id) || null;
    },

    insert(collection, data) {
        const docs = readCollection(collection);
        const doc = { id: uuidv4(), ...data, createdAt: new Date().toISOString() };
        docs.push(doc);
        writeCollection(collection, docs);
        return doc;
    },

    update(collection, id, data) {
        const docs = readCollection(collection);
        const idx = docs.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Document not found: ' + id);
        docs[idx] = { ...docs[idx], ...data, updatedAt: new Date().toISOString() };
        writeCollection(collection, docs);
        return docs[idx];
    },

    delete(collection, id) {
        const docs = readCollection(collection);
        const filtered = docs.filter(d => d.id !== id);
        writeCollection(collection, filtered);
    },

    getCounter(name) {
        ensureDir();
        const file = path.join(DATA_DIR, '_counters.json');
        let counters = {};
        if (fs.existsSync(file)) {
            try { counters = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { }
        }
        counters[name] = (counters[name] || 0) + 1;
        try {
            fs.writeFileSync(file, JSON.stringify(counters, null, 2), 'utf8');
        } catch (e) {
            if (!IS_LAMBDA) console.error('[localStore] Counter write failed:', e.message);
        }
        return counters[name];
    }
};

module.exports = localStore;
