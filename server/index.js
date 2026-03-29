const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const backupService = require('./utils/backupService');
require('dotenv').config();

const lrRoutes = require('./routes/lrRoutes');
const axios = require('axios');
const voucherRoutes = require('./routes/voucherRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const cashbookRoutes = require('./routes/cashbookRoutes');
const stockRoutes = require('./routes/stockRoutes');
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

// Run migrations on startup (local only — Netlify filesystem is read-only)
if (!process.env.NETLIFY) {
    stockService.init();
}

const app = express();
app.use(express.json());

app.use('/api/lr', lrRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cashbook', cashbookRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sell', sellRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/public', publicRoutes);

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
app.use('/api/jkl/lr', jklLrRoutes);
app.use('/api/jkl/stock', jklStockRoutes);
app.use('/api/jkl/cashbook', jklCashbookRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/mileage', mileageRoutes);

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    const code = req.query.code;
    if (code) {
        return res.send(`
            <div style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1 style="color: #10b981;">✔ Authorization Successful!</h1>
                <p>Please <b>copy the code</b> below and paste it into the "Backup Settings" page in your app:</p>
                <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 18px; margin: 20px 0; word-break: break-all; border: 1px solid #cbd5e1;">
                    ${code}
                </div>
                <p style="color: #64748b; font-size: 14px;">Once you have copied the code, you can close this tab.</p>
            </div>
        `);
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
