/**
 * labourAccountService.js — what the labour is owed for moving bags.
 *
 * Everything needed to price the work is already written down: a loading
 * receipt says the material, the bag count and whether the load came from the
 * godown or was a crossing, and a MIGO entry says what arrived. Until now it
 * was recorded and then thrown away.
 *
 * Earnings are never stored. They are worked out from the receipts on every
 * read, so correcting a rate re-prices the history instead of leaving stale
 * rows behind — which is what counting every receipt ever recorded requires.
 * Only the rates and the payments are written down.
 *
 * What pays, and what does not:
 *
 *   Loading receipt  From Godown   → godown_load     paid
 *                    Crossing      → crossing_load   paid
 *                    Direct        →                 nothing: labour never touched it
 *   MIGO             Godown Unload → godown_unload   paid
 *                    Crossing      →                 nothing
 *                    Direct        →                 nothing
 *
 * The asymmetry is deliberate and was confirmed with the firm: a crossing at
 * the loading gate is bags moved between trucks, a crossing on the way in is a
 * truck passing through.
 */

const { getCol } = require('./collectionUtils');

/** Rate keys. A material with no rate of its own falls back to the default. */
const ACTIVITIES = ['godown_load', 'crossing_load', 'godown_unload'];

const ACTIVITY_LABEL = {
  godown_load: 'Loading from godown',
  crossing_load: 'Crossing (loading)',
  godown_unload: 'Godown unload (MIGO)',
};

/** The two labour crews. The three dumps share one; Jharli has its own. */
const GROUPS = [
  { key: 'dump', label: 'Dump labour', hint: 'Kosli, Jhajjar and Bahadurgarh' },
  { key: 'jharli', label: 'Jharli labour', hint: 'JK Lakshmi and JK Super' },
];

/**
 * Every plant, the collections it keeps, and whose labour works it. The legacy
 * JK Super book at /lr belongs with Jharli — that plant runs from there.
 */
const PLANTS = [
  { key: 'kosli', label: 'Kosli', group: 'dump', lr: 'kosli_loading_receipts', migo: 'kosli_stock_additions', materials: 'kosli_materials' },
  { key: 'jhajjar', label: 'Jhajjar', group: 'dump', lr: 'jhajjar_loading_receipts', migo: 'jhajjar_stock_additions', materials: 'jhajjar_materials' },
  { key: 'bahadurgarh', label: 'Bahadurgarh', group: 'dump', lr: 'bahadurgarh_loading_receipts', migo: 'bahadurgarh_stock_additions', materials: 'bahadurgarh_materials' },
  { key: 'jkl', label: 'JK Lakshmi', group: 'jharli', lr: 'jkl_loading_receipts', migo: 'jkl_stock_additions', materials: 'jkl_materials' },
  // The legacy JK Super book. Its receipts still count if any exist, but its
  // material list is not surfaced anywhere in the app any more, and folding it
  // into Jharli's would put the dump's materials on the wrong rate sheet.
  { key: 'main', label: 'JK Super', group: 'jharli', lr: 'loading_receipts', migo: 'stock_additions', materials: null },
];

/** What the stock module falls back to when a plant has named no materials. */
const DEFAULT_MATERIALS = ['PPC', 'OPC43', 'Adstar', 'OPC FS', 'OPC53 FS', 'Weather'];
const JKL_MATERIALS = ['PPC', 'OPC43', 'Pro+'];

const RATES_COL = 'labour_rates';
const PAYMENTS_COL = 'labour_payments';
const RATES_DOC = 'rates';

const num = (x) => parseFloat(x) || 0;

/** The loading types a receipt can carry, and the rate each one earns. */
const LOADING_ACTIVITY = {
  'From Godown': 'godown_load',
  'Godown': 'godown_load',      // rows saved before the label changed
  'Crossing': 'crossing_load',
  'Direct': null,               // labour never touched it
};

/** The unloading types a MIGO entry can carry. Only one of them pays. */
const UNLOADING_ACTIVITY = {
  'Godown Unload': 'godown_unload',
  'Crossing': null,
  'Direct': null,
};

/**
 * The rate for one line. A material priced specifically beats the group
 * default; without the fallback the screen would read zero for every material
 * nobody had got round to pricing yet.
 */
function rateFor(rates, group, material, activity) {
  const g = rates?.groups?.[group];
  if (!g || !activity) return 0;
  const own = g.materials?.[material]?.[activity];
  if (own !== undefined && own !== null && own !== '') return num(own);
  return num(g.default?.[activity]);
}

/** A blank rate sheet — what a firm that has never entered a rate starts with. */
function emptyRates() {
  const groups = {};
  GROUPS.forEach(({ key }) => {
    groups[key] = { default: Object.fromEntries(ACTIVITIES.map(a => [a, 0])), materials: {} };
  });
  return { groups };
}

/** Drops anything not in the shape above, so a bad body cannot poison the doc. */
function sanitiseRates(body = {}) {
  const out = emptyRates();
  GROUPS.forEach(({ key }) => {
    const src = body?.groups?.[key] || {};
    ACTIVITIES.forEach(a => { out.groups[key].default[a] = num(src.default?.[a]); });
    Object.entries(src.materials || {}).forEach(([material, byActivity]) => {
      const name = String(material || '').trim();
      if (!name) return;
      const row = {};
      ACTIVITIES.forEach(a => {
        const v = byActivity?.[a];
        // '' means "no rate of its own" and must survive as absent, not as 0 —
        // a stored 0 would override the group default with free labour.
        if (v !== undefined && v !== null && v !== '') row[a] = num(v);
      });
      if (Object.keys(row).length) out.groups[key].materials[name] = row;
    });
  });
  return out;
}

const store = () => {
  const { db, isAvailable } = require('../firebase');
  const localStore = require('./localStore');
  return { db, isAvailable, localStore };
};

const readAll = async (col, orgId) => {
  const { db, isAvailable, localStore } = store();
  if (isAvailable()) {
    const snap = await db.collection(col).where('orgId', '==', orgId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return localStore.getAll(col).filter(r => r.orgId === orgId);
};

async function getRates(orgId, req) {
  const col = getCol(RATES_COL, req);
  const { db, isAvailable, localStore } = store();
  let doc = null;
  if (isAvailable()) {
    const snap = await db.collection(col).doc(RATES_DOC).get();
    doc = snap.exists ? snap.data() : null;
  } else {
    doc = localStore.getById(col, RATES_DOC);
  }
  if (!doc || doc.orgId !== orgId) return { ...emptyRates(), updatedAt: null, updatedBy: '' };
  return { ...emptyRates(), ...doc, groups: sanitiseRates(doc).groups };
}

async function saveRates(orgId, req, body, updatedBy) {
  const col = getCol(RATES_COL, req);
  const { db, isAvailable, localStore } = store();
  const payload = {
    ...sanitiseRates(body),
    orgId,
    updatedBy: updatedBy || '',
    updatedAt: new Date().toISOString(),
  };
  if (isAvailable()) await db.collection(col).doc(RATES_DOC).set(payload, { merge: false });
  else localStore.upsert(col, RATES_DOC, payload);
  return payload;
}

/**
 * One priced line per loading-receipt row and per MIGO entry.
 *
 * @param {{from?: string, to?: string}} range inclusive YYYY-MM-DD bounds
 * @returns {Promise<Array>} `{ id, date, group, plant, source, ref, truckNo,
 *   material, bags, type, activity, rate, amount }` — lines that earn nothing
 *   are kept, with amount 0, so a Direct load is visibly accounted for rather
 *   than silently absent.
 */
async function earnings(orgId, req, { from, to } = {}, rates) {
  const sheet = rates || await getRates(orgId, req);
  const inRange = (d) => {
    const day = String(d || '').slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };

  const perPlant = await Promise.all(PLANTS.map(async (plant) => {
    const [lrRows, migoRows] = await Promise.all([
      readAll(getCol(plant.lr, req), orgId).catch(() => []),
      readAll(getCol(plant.migo, req), orgId).catch(() => []),
    ]);
    const lines = [];

    lrRows.forEach(r => {
      if (!inRange(r.date)) return;
      const type = r.loadingType || 'From Godown';
      const activity = LOADING_ACTIVITY[type] === undefined ? 'godown_load' : LOADING_ACTIVITY[type];
      const bags = parseInt(r.totalBags, 10) || 0;
      const rate = rateFor(sheet, plant.group, r.material, activity);
      lines.push({
        id: `lr-${plant.key}-${r.id}`,
        date: String(r.date || '').slice(0, 10),
        group: plant.group, plant: plant.key, plantLabel: plant.label,
        source: 'lr', ref: r.lrNo ? `LR ${r.lrNo}` : 'LR',
        truckNo: r.truckNo || '', material: r.material || '',
        bags, type, activity, rate, amount: activity ? bags * rate : 0,
      });
    });

    migoRows.forEach(r => {
      if (!inRange(r.date)) return;
      // Entries made before the field existed were all godown unloads — that
      // was the only thing MIGO recorded, so treating them as anything else
      // would rewrite history the firm already worked to.
      const type = r.unloadingType || 'Godown Unload';
      const activity = UNLOADING_ACTIVITY[type] === undefined ? 'godown_unload' : UNLOADING_ACTIVITY[type];
      const bags = parseInt(r.quantity, 10) || 0;
      const rate = rateFor(sheet, plant.group, r.material, activity);
      lines.push({
        id: `migo-${plant.key}-${r.id}`,
        date: String(r.date || '').slice(0, 10),
        group: plant.group, plant: plant.key, plantLabel: plant.label,
        source: 'migo', ref: 'MIGO',
        truckNo: r.truckNo || '', material: r.material || '',
        bags, type, activity, rate, amount: activity ? bags * rate : 0,
      });
    });

    return lines;
  }));

  return perPlant.flat().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * The materials each crew can be given a rate for, taken from the stock
 * modules they work rather than from what happens to have been loaded already —
 * otherwise a material in stock but not yet moved cannot be priced until after
 * the first load has gone out unpriced.
 *
 * Read straight from the collections: `stockService.getMaterialsList` seeds a
 * collection it finds empty, and the rate sheet has no business writing
 * materials into a plant's stock module.
 */
async function materialsByGroup(orgId, req) {
  const out = {};
  GROUPS.forEach(g => { out[g.key] = new Set(); });

  await Promise.all(PLANTS.filter(p => p.materials).map(async (plant) => {
    let names = [];
    try {
      const rows = await readAll(getCol(plant.materials, req), orgId);
      names = rows.map(r => String(r.name || '').trim()).filter(Boolean);
    } catch { names = []; }
    if (!names.length) names = plant.materials === 'jkl_materials' ? JKL_MATERIALS : DEFAULT_MATERIALS;
    names.forEach(n => out[plant.group].add(n));
  }));

  return Object.fromEntries(GROUPS.map(g => [g.key, [...out[g.key]].sort()]));
}

async function listPayments(orgId, req, { from, to } = {}) {
  const rows = await readAll(getCol(PAYMENTS_COL, req), orgId);
  return rows
    .filter(p => {
      const day = String(p.date || '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

async function addPayment(orgId, req, body, createdBy) {
  const group = String(body?.group || '');
  if (!GROUPS.some(g => g.key === group)) throw new Error('Unknown labour group: ' + group);
  const amount = num(body?.amount);
  if (amount <= 0) throw new Error('Amount must be positive');

  const payload = {
    orgId, group, amount,
    date: body?.date || new Date().toISOString().slice(0, 10),
    mode: body?.mode || 'Cash',
    remark: body?.remark || '',
    createdBy: createdBy || '',
    createdAt: new Date().toISOString(),
  };
  const col = getCol(PAYMENTS_COL, req);
  const { db, isAvailable, localStore } = store();
  if (isAvailable()) {
    const ref = db.collection(col).doc();
    await ref.set(payload);
    return { id: ref.id, ...payload };
  }
  return localStore.insert(col, payload);
}

async function removePayment(orgId, req, id) {
  const col = getCol(PAYMENTS_COL, req);
  const { db, isAvailable, localStore } = store();
  if (isAvailable()) {
    const snap = await db.collection(col).doc(id).get();
    if (!snap.exists || snap.data().orgId !== orgId) throw new Error('Payment not found');
    await db.collection(col).doc(id).delete();
    return;
  }
  const doc = localStore.getById(col, id);
  if (!doc || doc.orgId !== orgId) throw new Error('Payment not found');
  localStore.delete(col, id);
}

/** Earned, paid and still owed, per group — with the detail behind each total. */
function summarise(lines = [], payments = []) {
  const groups = {};
  GROUPS.forEach(g => {
    groups[g.key] = {
      ...g, earned: 0, paid: 0, balance: 0, bags: 0, unpricedBags: 0,
      byActivity: {}, byMaterial: {}, byPlant: {},
    };
  });

  lines.forEach(l => {
    const g = groups[l.group];
    if (!g) return;
    if (!l.activity) return;              // Direct: recorded, never charged
    g.earned += l.amount;
    g.bags += l.bags;
    if (l.rate <= 0) g.unpricedBags += l.bags;
    const bump = (bucket, key) => {
      bucket[key] = bucket[key] || { bags: 0, amount: 0 };
      bucket[key].bags += l.bags;
      bucket[key].amount += l.amount;
    };
    bump(g.byActivity, l.activity);
    bump(g.byMaterial, l.material || 'Unnamed');
    bump(g.byPlant, l.plantLabel);
  });

  payments.forEach(p => {
    const g = groups[p.group];
    if (g) g.paid += num(p.amount);
  });

  Object.values(groups).forEach(g => { g.balance = g.earned - g.paid; });

  const list = GROUPS.map(g => groups[g.key]);
  return {
    groups: list,
    totals: {
      earned: list.reduce((s, g) => s + g.earned, 0),
      paid: list.reduce((s, g) => s + g.paid, 0),
      balance: list.reduce((s, g) => s + g.balance, 0),
    },
  };
}

module.exports = {
  ACTIVITIES, ACTIVITY_LABEL, GROUPS, PLANTS,
  LOADING_ACTIVITY, UNLOADING_ACTIVITY, DEFAULT_MATERIALS, JKL_MATERIALS,
  rateFor, emptyRates, sanitiseRates, materialsByGroup,
  getRates, saveRates, earnings, listPayments, addPayment, removePayment, summarise,
};
