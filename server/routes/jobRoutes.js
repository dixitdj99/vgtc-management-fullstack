/**
 * jobRoutes.js — HTTP triggers for scheduled work.
 *
 * Firebase App Hosting / Cloud Run scale to zero, so an in-process cron timer
 * never fires. Cloud Scheduler calls these endpoints instead:
 *
 *   gcloud scheduler jobs create http vgtc-weekly-backup \
 *     --schedule="0 0 * * 0" --time-zone="Asia/Kolkata" \
 *     --uri="https://<your-host>/api/jobs/weekly-backup" --http-method=POST \
 *     --headers="X-Cron-Secret=<value of the CRON_SECRET secret>"
 *
 *   gcloud scheduler jobs create http vgtc-daily-alerts \
 *     --schedule="0 9 * * *" --time-zone="Asia/Kolkata" \
 *     --uri="https://<your-host>/api/jobs/daily-alerts" --http-method=POST \
 *     --headers="X-Cron-Secret=<value of the CRON_SECRET secret>"
 *
 *   gcloud scheduler jobs create http vgtc-weekly-lists \
 *     --schedule="30 0 * * 0" --time-zone="Asia/Kolkata" \
 *     --uri="https://<your-host>/api/jobs/weekly-lists" --http-method=POST \
 *     --headers="X-Cron-Secret=<value of the CRON_SECRET secret>"
 *
 *   gcloud scheduler jobs create http vgtc-eway-sync \
 *     --schedule="*\/30 6-22 * * *" --time-zone="Asia/Kolkata" \
 *     --uri="https://<your-host>/api/jobs/eway-sync" --http-method=POST \
 *     --headers="X-Cron-Secret=<value of the CRON_SECRET secret>"
 *
 * Auth is a shared secret in the X-Cron-Secret header, compared in constant
 * time. It fails closed: if CRON_SECRET is unset, every request is rejected.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { JOBS } = require('../jobs');

const timingSafeEqual = (a, b) => {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    // timingSafeEqual throws on length mismatch, so compare lengths separately.
    // Length is not the secret here; the value is.
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

const requireCronSecret = (req, res, next) => {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        console.error('[Jobs] CRON_SECRET is not configured — rejecting job trigger.');
        return res.status(503).json({ error: 'Scheduled jobs are not configured on this server.' });
    }
    const provided = req.get('X-Cron-Secret') || '';
    if (!timingSafeEqual(provided, expected)) {
        console.warn('[Jobs] Rejected job trigger with an invalid X-Cron-Secret header.');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

router.use(requireCronSecret);

// POST /api/jobs/:name — run a known job and report the outcome.
router.post('/:name', async (req, res) => {
    const job = JOBS[req.params.name];
    if (!job) {
        return res.status(404).json({ error: `Unknown job "${req.params.name}"` });
    }
    // jobs.js swallows and reports failures, so this never rejects. A non-2xx is
    // still returned on failure so Cloud Scheduler records the run as failed.
    const result = await job();
    res.status(result.status === 'error' ? 500 : 200).json(result);
});

module.exports = router;
