/**
 * archiveRoutes — receives the HTML a module just printed and files it in Drive.
 *
 * Returns 200 with `archived: false` when Drive is not connected, rather than an
 * error. The client treats this as a background copy and must not surface a red
 * banner on a screen the yard uses all day just because a token expired.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const archiveService = require('../utils/archiveService');

router.use(requireAuth, tenancyMiddleware);

// The HTML of a wide list export is the biggest thing posted here.
router.use(express.json({ limit: '3mb' }));

router.post('/', async (req, res) => {
    const { module, kind, name, html, plant, meta } = req.body || {};
    try {
        const result = await archiveService.archive({ module, kind, name, html, plant, meta });
        res.json(result);
    } catch (err) {
        // Log it, but still answer 200: the document was printed successfully and
        // the user has nothing to act on.
        console.error('[Archive] Failed:', err.message);
        res.json({ archived: false, reason: err.message });
    }
});

/** What the client can check before offering an "archived" indicator. */
router.get('/status', async (req, res) => {
    const driveService = require('../utils/driveService');
    res.json({
        configured: driveService.isConfigured(),
        authorized: await driveService.isAuthorized().catch(() => false),
    });
});

module.exports = router;
