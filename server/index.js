const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const backupService = require('./utils/backupService');
require('dotenv').config();

const lrRoutes = require('./routes/lrRoutes'); // Legacy
const axios = require('axios');
const voucherRoutes = require('./routes/voucherRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const cashbookRoutes = require('./routes/cashbookRoutes');
const stockRoutes = require('./routes/stockRoutes'); // Legacy
const kosliLrRoutes = require('./routes/kosliLrRoutes');
const jhajjarLrRoutes = require('./routes/jhajjarLrRoutes');
const kosliStockRoutes = require('./routes/kosliStockRoutes');
const jhajjarStockRoutes = require('./routes/jhajjarStockRoutes');
const stockService = require('./utils/stockService');

// JK Lakshmi specific routes
const jklLrRoutes = require('./routes/jklLrRoutes');
const jklStockRoutes = require('./routes/jklStockRoutes');
const jklCashbookRoutes = require('./routes/jklCashbookRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const sellRoutes = require('./routes/sellRoutes');
const mileageRoutes = require('./routes/mileageRoutes');
const backupRoutes = require('./routes/backupRoutes');
const publicRoutes = require('./routes/publicRoutes');
const labourRoutes = require('./routes/labourRoutes');
const { requireAuth } = require('./middleware/auth');

// Run migrations on startup (local only — Netlify filesystem is read-only)
if (!process.env.NETLIFY) {
    stockService.init();
}

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use('/api/kosli/lr', requireAuth, kosliLrRoutes);
app.use('/api/jhajjar/lr', requireAuth, jhajjarLrRoutes);
app.use('/api/vouchers', requireAuth, voucherRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cashbook', requireAuth, cashbookRoutes);
app.use('/api/kosli/stock', requireAuth, kosliStockRoutes);
app.use('/api/jhajjar/stock', requireAuth, jhajjarStockRoutes);
app.use('/api/sell', requireAuth, sellRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/lr', requireAuth, lrRoutes); // Legacy JK Super route
app.use('/api/labour', labourRoutes);

// Weather Proxy to avoid CORS
app.get('/api/weather', async (req, res) => {
  try {
    const city = req.query.city || 'Ahmedabad';
    // 5 second timeout for weather proxy
    const response = await axios.get(`https://wttr.in/${city}?format=j1`, { timeout: 5000 });
    res.json(response.data);
  } catch (error) {
    console.error('Weather Proxy Error:', error.message);
    res.status(502).json({ error: 'Weather service temporarily unavailable' });
  }
});

// JKL Routes
app.use('/api/jkl/lr', requireAuth, jklLrRoutes);
app.use('/api/jkl/stock', requireAuth, jklStockRoutes);
app.use('/api/jkl/cashbook', requireAuth, jklCashbookRoutes);
app.use('/api/vehicles', requireAuth, vehicleRoutes);
app.use('/api/mileage', requireAuth, mileageRoutes);

const PORT = process.env.PORT || 5000;

app.get('/', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        return res.send(`<html><body><script>
            if (window.opener) { window.opener.postMessage({ type: 'oauth-error', msg: '${error}' }, '*'); window.close(); }
        </script><p>Authorization failed: ${error}</p></body></html>`);
    }

    if (code) {
        // Auto-exchange the code — no manual copy needed
        const driveService = require('./utils/driveService');
        try {
            await driveService.saveToken(code);
            return res.send(`<html><body><script>
                if (window.opener) {
                    window.opener.postMessage({ type: 'oauth-success' }, '*');
                    setTimeout(() => window.close(), 500);
                } else {
                    document.write('<p style="font-family:sans-serif;padding:40px;text-align:center;color:#10b981">&#x2705; Google Drive authorized! You can close this tab.</p>');
                }
            </script><p style="font-family:sans-serif;padding:40px;text-align:center;color:#10b981">&#x2705; Authorized! Closing...</p></body></html>`);
        } catch (e) {
            return res.send(`<html><body><script>
                if (window.opener) { window.opener.postMessage({ type: 'oauth-error', msg: 'Token exchange failed' }, '*'); window.close(); }
            </script><p style="font-family:sans-serif;padding:40px;text-align:center;color:#f43f5e">&#x274c; Authorization failed: ${e.message}</p></body></html>`);
        }
    }

    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV !== 'production' && !process.env.NETLIFY) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
        
        // Schedule weekly backup: every Sunday at 00:00
        cron.schedule('0 0 * * 0', () => {
            console.log('[Cron] Running scheduled weekly backup...');
            backupService.runWeeklyBackup();
        });
    });
}

module.exports = app;
