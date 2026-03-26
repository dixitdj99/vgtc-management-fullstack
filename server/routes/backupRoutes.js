const express = require('express');
const router = express.Router();
const driveService = require('../utils/driveService');
const backupService = require('../utils/backupService');

// GET /api/backup/auth-status
router.get('/auth-status', async (req, res) => {
    res.json({ 
        authorized: await driveService.isAuthorized(),
        configured: driveService.isConfigured()
    });
});

// GET /api/backup/auth-url
router.get('/auth-url', (req, res) => {
    const url = driveService.getAuthUrl();
    if (!url) return res.status(500).json({ error: 'OAuth client not configured. Check credentials.json' });
    res.json({ url });
});

// POST /api/backup/submit-code
router.post('/submit-code', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Authorization code required' });
    try {
        await driveService.saveToken(code);
        res.json({ message: 'Google Drive authorized successfully!' });
    } catch (e) {
        res.status(500).json({ error: 'Invalid code or authentication failed' });
    }
});

// POST /api/backup/now
router.post('/now', async (req, res) => {
    try {
        if (!driveService.isAuthorized()) {
            return res.status(401).json({ error: 'Google Drive not authorized' });
        }
        // Run in background
        backupService.runWeeklyBackup();
        res.json({ message: 'Backup started in background. Check server logs for status.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
