/**
 * backfillPartyBrands.js — tag existing parties as JK Lakshmi / JK Super from
 * their own trading history.
 *
 * The party pool predates the brand split, so every existing party is untagged
 * and shows in every module. Rather than someone ticking hundreds of parties by
 * hand, this reads what has actually been recorded against each name — LRs in
 * the four location collections, vouchers by type — and tags accordingly.
 *
 *   node server/scripts/backfillPartyBrands.js            # dry run, prints only
 *   node server/scripts/backfillPartyBrands.js --apply    # writes the tags
 *
 * Rules:
 *   - Only ADDS groups. Never removes a tag someone set by hand.
 *   - A party whose history spans both sides gets both groups.
 *   - A party with no history is listed and left untagged (still visible
 *     everywhere), for Party Master's "Untagged" filter to pick up.
 *
 * Deliberately a one-off command, not a deploy hook: it is a bulk write over
 * live party records, and someone should read the dry run before it happens.
 */

require('dotenv').config();
const { db, isAvailable } = require('../firebase');
const { getEnvPrefix } = require('../utils/envConfig');
const { brandOfType } = require('../utils/partyBrands');
const { normalizePartyName } = require('../utils/partyNameUtils');

if (!isAvailable()) {
    console.error('Firebase is not available — check server configuration.');
    process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const PREFIX = getEnvPrefix();
const col = (name) => `${PREFIX}${name}`;

// Where evidence lives: each LR collection belongs wholly to one side; vouchers
// carry their side in `type`. Mirrors groupOfLrCollection in lrService.js.
const LR_SOURCES = [
    { collection: 'jkl_loading_receipts', group: 'jklakshmi' },
    { collection: 'loading_receipts', group: 'jklakshmi' },   // JKL Dump
    { collection: 'kosli_loading_receipts', group: 'jksuper' },
    { collection: 'jhajjar_loading_receipts', group: 'jksuper' },
    { collection: 'bahadurgarh_loading_receipts', group: 'jksuper' },
];

async function readAll(name) {
    try {
        const snap = await db.collection(col(name)).get();
        return snap.docs.map(d => d.data());
    } catch (err) {
        console.warn(`  (skipping ${col(name)}: ${err.message})`);
        return [];
    }
}

(async () => {
    console.log(`Backfill party brands — ${APPLY ? 'APPLY' : 'DRY RUN'} (prefix: "${PREFIX}")\n`);

    // name -> { groups: Set, evidence: count }
    const history = new Map();
    const record = (name, group) => {
        const key = normalizePartyName(name || '');
        if (!key || !group) return;
        if (!history.has(key)) history.set(key, { groups: new Set(), evidence: 0 });
        const h = history.get(key);
        h.groups.add(group);
        h.evidence++;
    };

    for (const { collection, group } of LR_SOURCES) {
        const rows = await readAll(collection);
        rows.forEach(r => record(r.partyName, group));
        console.log(`read ${String(rows.length).padStart(5)} rows from ${col(collection)}`);
    }

    const vouchers = await readAll('vouchers');
    vouchers.forEach(v => {
        const group = brandOfType(v.type);
        record(v.partyName, group);
        (v.deliveries || []).forEach(d => record(d.partyName, group));
    });
    console.log(`read ${String(vouchers.length).padStart(5)} rows from ${col('vouchers')}\n`);

    // NOTE: partyService reads/writes the parties collection UNPREFIXED (it
    // never went through getCol), so this must match or it tags a collection
    // nothing reads. If partyService is ever fixed to use the env prefix,
    // change this line with it.
    const partiesSnap = await db.collection('parties').get();
    const updates = [];
    const untouched = [];
    const noHistory = [];

    for (const doc of partiesSnap.docs) {
        const p = doc.data();
        const existing = new Set(Array.isArray(p.brands) ? p.brands : []);
        const found = history.get(normalizePartyName(p.name || ''));

        if (!found) {
            if (!existing.size) noHistory.push(p.name);
            continue;
        }

        const merged = new Set([...existing, ...found.groups]);
        if (merged.size === existing.size) { untouched.push(p.name); continue; }

        updates.push({ id: doc.id, name: p.name, before: [...existing], after: [...merged], evidence: found.evidence });
    }

    console.log(`${partiesSnap.size} parties · ${updates.length} to tag · ${untouched.length} already correct · ${noHistory.length} with no history\n`);

    for (const u of updates) {
        console.log(`  ${u.name}`.padEnd(46) + `${u.before.join(',') || '(none)'} -> ${u.after.join(',')}   (${u.evidence} records)`);
    }
    if (noHistory.length) {
        console.log(`\nNo trading history — left untagged, still visible everywhere:`);
        noHistory.forEach(n => console.log(`  ${n}`));
    }

    if (!APPLY) {
        console.log(`\nDry run only. Re-run with --apply to write ${updates.length} update(s).`);
        process.exit(0);
    }

    let written = 0;
    for (let i = 0; i < updates.length; i += 400) {
        const batch = db.batch();
        for (const u of updates.slice(i, i + 400)) {
            batch.update(db.collection('parties').doc(u.id), { brands: u.after });
            written++;
        }
        await batch.commit();
    }
    console.log(`\nDone — ${written} part${written === 1 ? 'y' : 'ies'} tagged.`);
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
