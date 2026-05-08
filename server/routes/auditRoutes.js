const express = require('express');
const router = express.Router();
const { getLog } = require('../services/auditService');
const { requireAdmin } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');

router.use(requireAdmin, tenancyMiddleware);

// GET /api/audit — paginated audit log for the admin's org
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const offset = parseInt(req.query.offset) || 0;
        const entries = await getLog(req.orgId, { limit, offset });
        res.json({ entries, offset, limit });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
