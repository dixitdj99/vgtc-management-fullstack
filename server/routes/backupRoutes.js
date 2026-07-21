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
        return res.send(`
            <div style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; max-width: 500px; margin: 40px auto; border: 1px solid #fca5a5; border-radius: 16px; background: #fff5f5;">
                <h1 style="color: #ef4444; font-size: 22px; margin-bottom: 12px;">❌ Authorization Failed</h1>
                <p style="color: #7f1d1d; font-size: 14px; line-height: 1.5;">${error}</p>
                <p style="color: #991b1b; font-size: 13px; margin-top: 16px;">You can close this tab and try again.</p>
            </div>
        `);
    }
    if (!code) {
        return res.status(400).send('No authorization code received.');
    }
    
    // Display the code to the user for manual copy-paste
    res.send(`
        <div style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; max-width: 500px; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 20px; background: #ffffff; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);">
            <div style="font-size: 40px; margin-bottom: 16px;">🔑</div>
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 8px 0;">Authorization Successful!</h1>
            <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0;">Please copy the code below and paste it into the <b>Verify Code</b> field in the backup settings dashboard.</p>
            
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 16px; border-radius: 12px; font-family: monospace; font-size: 15px; color: #0f172a; word-break: break-all; user-select: all; cursor: pointer; margin-bottom: 24px; font-weight: 600;" title="Click to select all" onclick="document.execCommand('copy')">
                ${code}
            </div>
            
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Once copied, you can close this tab safely.</p>
        </div>
    `);
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
