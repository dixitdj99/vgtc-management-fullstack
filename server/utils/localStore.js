/**
 * localStore.js — simple JSON file-based store for when Firebase is not connected.
 * Each collection is stored as a separate JSON file in server/data/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readCollection(name) {
    const file = path.join(DATA_DIR, name + '.json');
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return []; }
}

function writeCollection(name, docs) {
    const file = path.join(DATA_DIR, name + '.json');
    fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf8');
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
        const file = path.join(DATA_DIR, '_counters.json');
        let counters = {};
        if (fs.existsSync(file)) {
            try { counters = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { }
        }
        counters[name] = (counters[name] || 0) + 1;
        fs.writeFileSync(file, JSON.stringify(counters, null, 2), 'utf8');
        return counters[name];
    }
};

module.exports = localStore;
