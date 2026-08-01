/**
 * ewbSync.js — pulling the day's e-way bills in.
 *
 * Runs on a schedule (see jobs.js) and on demand. Two deliberate choices:
 *
 *  1. **Yesterday is polled too.** A bill generated at 11pm gets its Part-B
 *     vehicle the next morning, and a load that left last night is still the
 *     one the yard is entering at 8am.
 *
 *  2. **Detail is fetched sparingly.** The summary list is one call; each
 *     detail is another. Bills already stored with a vehicle are left alone, so
 *     a half-hourly sync over fifty loads costs fifty calls on the first run and
 *     almost none after that. NIC rate-limits, and there is nothing to gain by
 *     re-reading a bill that cannot have changed.
 *
 * The raw detail is stored, not a challan draft. Drafts are computed at read
 * time against the requesting plant's material list — one feed, five plants,
 * and "PPC" resolved correctly for each.
 */

const ewbService = require('./ewbService');
const ewbStore = require('./ewbStore');

const dayOffset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
};

/**
 * @param {string} orgId
 * @param {{billsCol: string, stateCol?: string, days?: number}} opts
 * @returns {Promise<object>} counts for the job log and the UI
 */
async function syncOrg(orgId, { billsCol, stateCol, days = 2 } = {}) {
    if (!ewbService.isConfigured()) {
        return { skipped: true, reason: 'not configured', missing: ewbService.missingConfig() };
    }

    const known = await ewbStore.listBills(orgId, billsCol);
    const byNo = new Map(known.map(b => [String(b.ewbNo), b]));
    // A bill generated late yesterday is listed under both dates we poll, and
    // `byNo` is a snapshot from before this run — without this, every such bill
    // costs a second detail call for nothing.
    const fetched = new Set();

    let seen = 0, added = 0, refreshed = 0;
    const errors = [];

    for (let i = 0; i < days; i++) {
        let list;
        try {
            list = await ewbService.listForTransporter(dayOffset(-i));
        } catch (err) {
            // One bad day must not lose the other. Record and carry on.
            errors.push(`list ${i === 0 ? 'today' : `-${i}d`}: ${err.message}`);
            continue;
        }

        for (const summary of list) {
            const ewbNo = String(summary.ewbNo || '');
            if (!ewbNo) continue;
            seen++;

            if (fetched.has(ewbNo)) continue;

            const existing = byNo.get(ewbNo);
            // Re-read only when there is something still to learn: a bill we have
            // never seen, or one whose Part-B had no vehicle last time.
            const needsDetail = !existing || !existing.detail
                || !(existing.detail.VehiclListDetails || []).some(v => v?.vehicleNo);
            if (!needsDetail) continue;

            fetched.add(ewbNo);
            try {
                const detail = await ewbService.getDetail(ewbNo);
                const { created } = await ewbStore.upsertBill(orgId, {
                    ewbNo,
                    ewbDate: summary.ewbDate || detail.ewayBillDate || '',
                    docNo: String(summary.docNo || detail.docNo || ''),
                    docDate: summary.docDate || detail.docDate || '',
                    genGstin: summary.genGstin || detail.fromGstin || '',
                    validUpto: summary.validUpto || detail.validUpto || '',
                    ewbStatus: summary.status || detail.status || '',
                    detail,
                }, billsCol);
                if (created) added++; else refreshed++;
            } catch (err) {
                errors.push(`${ewbNo}: ${err.message}`);
            }
        }
    }

    const state = {
        orgId,
        lastSyncAt: new Date().toISOString(),
        lastError: errors.length ? errors.slice(0, 5).join(' | ') : null,
        lastCounts: { seen, added, refreshed },
    };
    if (stateCol) await ewbStore.writeState(orgId, state, stateCol);

    return { seen, added, refreshed, errors };
}

module.exports = { syncOrg };
