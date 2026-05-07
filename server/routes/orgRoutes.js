const express = require('express');
const router = express.Router();
const orgService = require('../services/orgService');

// Get current organization details
router.get('/', async (req, res) => {
    try {
        const org = await orgService.getById(req.orgId || 'vgtc');
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        res.json(org);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const orgId = req.params.id || req.orgId || 'vgtc';
        const org = await orgService.getById(orgId);
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        res.json(org);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
