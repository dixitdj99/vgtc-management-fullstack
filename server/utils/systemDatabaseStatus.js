const fs = require('fs');
const path = require('path');
const { db, isAvailable } = require('../firebase');
const { ENV, getEnvPrefix } = require('./envConfig');
const localStore = require('./localStore');

const localDataDir = process.env.K_SERVICE ? '/tmp/vgtc-data' : path.join(__dirname, '..', 'data');

function categoryFor(name) {
  if (/whatsapp|message/i.test(name)) return 'Messaging';
  if (/lr|loading|challan|stock|godown|destination/i.test(name)) return 'Logistics';
  if (/voucher|invoice|cashbook|payment|balance|party|parties|advance/i.test(name)) return 'Accounting';
  if (/vehicle|tyre|fuel|toll|mileage|maintenance/i.test(name)) return 'Fleet';
  if (/profile|attendance|labour|staff|user/i.test(name)) return 'People';
  if (/audit|config|backup|notification|setting/i.test(name)) return 'System';
  return 'Other';
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date || typeof value?.toDate === 'function') return 'timestamp';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function collectFields(samples) {
  const fields = new Map();
  const visit = (value, prefix = '') => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || valueType(value) === 'timestamp') return;
    for (const [key, child] of Object.entries(value)) {
      const field = prefix ? `${prefix}.${key}` : key;
      if (fields.size >= 200) return;
      const type = valueType(child);
      const existing = fields.get(field) || new Set();
      existing.add(type);
      fields.set(field, existing);
      if (type === 'object') visit(child, field);
    }
  };
  samples.forEach(visit);
  return [...fields.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, types]) => ({ name, types: [...types].sort() }));
}

async function collectionNames() {
  const prefix = getEnvPrefix();
  if (isAvailable()) {
    const refs = await db.listCollections();
    return refs.map(ref => ref.id).filter(name => !prefix || name.startsWith(prefix)).sort();
  }
  if (!fs.existsSync(localDataDir)) return [];
  return fs.readdirSync(localDataDir)
    .filter(name => name.endsWith('.json') && !name.startsWith('_'))
    .map(name => name.slice(0, -5))
    .filter(name => !prefix || name.startsWith(prefix))
    .sort();
}

async function inspectCollection(name, sampleLimit = 1) {
  if (isAvailable()) {
    const ref = db.collection(name);
    const [countResult, sampleResult] = await Promise.allSettled([
      ref.count().get(), ref.limit(sampleLimit).get()
    ]);
    if (countResult.status === 'rejected') {
      return { count: null, status: 'error', error: countResult.reason?.message || 'Count query failed', fields: [] };
    }
    const samples = sampleResult.status === 'fulfilled'
      ? sampleResult.value.docs.map(doc => doc.data()) : [];
    return {
      count: countResult.value.data().count,
      status: sampleResult.status === 'fulfilled' ? 'ok' : 'partial',
      error: sampleResult.status === 'rejected' ? sampleResult.reason?.message || 'Schema sample failed' : null,
      fields: collectFields(samples),
      sampledDocuments: samples.length
    };
  }
  const records = localStore.getAll(name);
  return { count: records.length, status: 'local', error: null,
    fields: collectFields(records.slice(0, sampleLimit)), sampledDocuments: Math.min(records.length, sampleLimit) };
}

async function getDatabaseTables() {
  const names = await collectionNames();
  const prefix = getEnvPrefix();
  const checkedAt = new Date().toISOString();
  const tables = [];
  for (let offset = 0; offset < names.length; offset += 8) {
    const batch = await Promise.all(names.slice(offset, offset + 8).map(async collectionName => {
      try {
        const detail = await inspectCollection(collectionName);
        const name = prefix ? collectionName.slice(prefix.length) : collectionName;
        return { name, collectionName, category: categoryFor(name), engine: isAvailable() ? 'Firestore' : 'Local JSON',
          checkedAt, ...detail };
      } catch (error) {
        const name = prefix ? collectionName.slice(prefix.length) : collectionName;
        return { name, collectionName, category: categoryFor(name), engine: isAvailable() ? 'Firestore' : 'Local JSON',
          checkedAt, count: null, status: 'error', error: error.message, fields: [] };
      }
    }));
    tables.push(...batch);
  }
  return {
    tables,
    totalTables: tables.length,
    totalDocs: tables.some(t => t.count === null) ? null : tables.reduce((sum, table) => sum + table.count, 0),
    failedTables: tables.filter(t => t.status === 'error' || t.status === 'partial').length,
    env: ENV,
    prefix: prefix || '(none)',
    engine: isAvailable() ? 'Firestore' : 'Local JSON',
    updatedAt: checkedAt
  };
}

async function getDatabaseTableDetail(collectionName) {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(collectionName)) return null;
  const names = await collectionNames();
  if (!names.includes(collectionName)) return null;
  const prefix = getEnvPrefix();
  const name = prefix ? collectionName.slice(prefix.length) : collectionName;
  const detail = await inspectCollection(collectionName, 5);
  return { name, collectionName, category: categoryFor(name), engine: isAvailable() ? 'Firestore' : 'Local JSON',
    checkedAt: new Date().toISOString(), ...detail };
}

module.exports = { getDatabaseTables, getDatabaseTableDetail, collectFields };
