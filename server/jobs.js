/**
 * jobs.js — Scheduled background work, defined once and callable from two places:
 *
 *   1. node-cron, when the server runs as a long-lived process (local dev, a VM).
 *   2. An authenticated HTTP endpoint (see routes/jobRoutes.js), for serverless
 *      hosts that scale to zero — Cloud Run / Firebase App Hosting kill the
 *      instance when idle, so an in-process cron timer never fires. There,
 *      Cloud Scheduler calls the endpoint instead.
 *
 * Each job is guarded by a run lock so a duplicate trigger (two warm instances,
 * a Scheduler retry, an impatient admin) cannot start a second overlapping run.
 */

const backupService = require('./utils/backupService');
const alertService = require('./services/alertService');
const { getEnvCol } = require('./utils/collectionUtils');

const running = new Set();

/**
 * Runs `fn` unless an identically-named job is already in flight.
 * Always resolves — job failures are logged, never thrown at the caller,
 * so a failed backup can't take the process down via an unhandled rejection.
 */
async function runExclusive(name, fn) {
    if (running.has(name)) {
        console.warn(`[Jobs] "${name}" is already running — skipping duplicate trigger.`);
        return { job: name, status: 'skipped', reason: 'already running' };
    }
    running.add(name);
    const startedAt = new Date().toISOString();
    console.log(`[Jobs] "${name}" started at ${startedAt}`);
    try {
        const result = await fn();
        console.log(`[Jobs] "${name}" finished successfully.`);
        return { job: name, status: 'ok', startedAt, result: result ?? null };
    } catch (err) {
        console.error(`[Jobs] "${name}" FAILED:`, err && err.stack ? err.stack : err);
        return { job: name, status: 'error', startedAt, error: err && err.message };
    } finally {
        running.delete(name);
    }
}

/** Weekly Google Drive backup of every plant's records. */
function weeklyBackup() {
    return runExclusive('weekly-backup', () => backupService.runWeeklyBackup());
}

/** Daily fleet alert email, sent once per organization. */
function dailyAlerts() {
    return runExclusive('daily-alerts', async () => {
        const { db } = require('./firebase');
        const orgsSnapshot = await db.collection('organizations').get();
        const orgs = orgsSnapshot.docs.map(doc => doc.data());

        const sent = [];
        const failed = [];
        for (const org of orgs) {
            const orgId = org.id || org.orgId;
            if (!orgId) continue;
            try {
                await alertService.sendDailyAlertReport(orgId, getEnvCol('vehicles'));
                sent.push(orgId);
            } catch (err) {
                // One bad org must not stop the rest of the fleet from being alerted.
                console.error(`[Jobs] Alert failed for org "${orgId}":`, err && err.message);
                failed.push(orgId);
            }
        }
        return { orgsAlerted: sent.length, orgsFailed: failed.length, failed };
    });
}

/**
 * Pulls the e-way bills the cement plants have assigned to VGTC, so the yard
 * can create a challan by tapping one instead of typing eight fields.
 *
 * Silent no-op until the NIC credentials exist — an unconfigured feed is the
 * normal state for a fresh install, not a failure worth alerting on.
 */
function ewaySync() {
    return runExclusive('eway-sync', async () => {
        const ewbService = require('./utils/ewbService');
        if (!ewbService.isConfigured()) {
            return { skipped: true, reason: 'e-way bill API is not configured' };
        }

        const { db } = require('./firebase');
        const ewbSync = require('./utils/ewbSync');
        const ewbStore = require('./utils/ewbStore');

        const orgsSnapshot = await db.collection('organizations').get();
        const orgs = orgsSnapshot.docs.map(doc => doc.data());

        const results = [];
        for (const org of orgs) {
            const orgId = org.id || org.orgId;
            if (!orgId) continue;
            try {
                const r = await ewbSync.syncOrg(orgId, {
                    billsCol: getEnvCol('eway_bills'),
                    stateCol: getEnvCol(ewbStore.STATE_COL),
                });
                results.push({ orgId, ...r });
            } catch (err) {
                // One org's bad credentials must not stop the rest of the sync.
                console.error(`[Jobs] E-way bill sync failed for org "${orgId}":`, err && err.message);
                results.push({ orgId, error: err && err.message });
            }
        }
        return { orgs: results.length, results };
    });
}

/**
 * A weekly copy of every list in the app, as Excel and PDF, into each module's
 * own Drive folder. Separate from weekly-backup, which files the per-document
 * PDFs — this one is the data behind them.
 */
function weeklyLists() {
    return runExclusive('weekly-lists', async () => {
        const driveService = require('./utils/driveService');
        if (!(await driveService.isAuthorized().catch(() => false))) {
            return { skipped: true, reason: 'Google Drive is not connected' };
        }

        const { db } = require('./firebase');
        const listBackupService = require('./utils/listBackupService');

        const orgsSnapshot = await db.collection('organizations').get();
        const results = [];
        for (const doc of orgsSnapshot.docs) {
            const org = doc.data();
            const orgId = org.id || org.orgId;
            if (!orgId) continue;
            try {
                results.push({ orgId, ...(await listBackupService.backupAllLists(orgId)) });
            } catch (err) {
                console.error(`[Jobs] Weekly list backup failed for org "${orgId}":`, err && err.message);
                results.push({ orgId, error: err && err.message });
            }
        }
        return { orgs: results.length, results };
    });
}

const JOBS = {
    'weekly-backup': weeklyBackup,
    'weekly-lists': weeklyLists,
    'daily-alerts': dailyAlerts,
    'eway-sync': ewaySync,
};

module.exports = { JOBS, weeklyBackup, weeklyLists, dailyAlerts, ewaySync };
