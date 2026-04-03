const express = require('express');
const router = express.Router();
const driveService = require('../utils/driveService');
const backupService = require('../utils/backupService');

// GET /api/backup/auth-status
const { requireAdmin } = require('../middleware/auth');

// All backup routes require admin role
router.use(requireAdmin);

router.get('/auth-status', async (req, res) => {
    res.json({ 
        authorized: await driveService.isAuthorized(),
        configured: driveService.isConfigured()
    });
});

// GET /api/backup/logs
router.get('/logs', async (req, res) => {
    try {
        const logs = await driveService.getLogs(30);
        res.json(logs);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch backup logs' });
    }
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

// GET /api/backup/oauth-callback  ← Google redirects here after user consent
// Must be whitelisted in Google Cloud Console as an Authorized Redirect URI
router.get('/oauth-callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) {
        return res.send(`<html><body><script>window.close(); window.opener && window.opener.postMessage({type:'oauth-error',msg:'${error}'},'*');</script><p>Authorization failed: ${error}. You can close this tab.</p></body></html>`);
    }
    if (!code) {
        return res.status(400).send('No authorization code received.');
    }
    try {
        await driveService.saveToken(code);
        // Close the popup and notify the opener
        res.send(`<html><body><script>
            if (window.opener) {
                window.opener.postMessage({ type: 'oauth-success' }, '*');
                window.close();
            } else {
                window.location.href = '/';
            }
        </script><p>✅ Google Drive authorized! You can close this tab.</p></body></html>`);
    } catch (e) {
        res.status(500).send(`<html><body><p>❌ Authorization failed: ${e.message}. Close this tab and try again.</p></body></html>`);
    }
});

// POST /api/backup/now
router.post('/now', async (req, res) => {
    try {
        if (!await driveService.isAuthorized()) {
            return res.status(401).json({ error: 'Google Drive not authorized' });
        }
        // Run in background
        backupService.runWeeklyBackup();
        res.json({ message: 'Backup started in background. Check Backup History below for status.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
