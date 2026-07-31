const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const jobs = require('./jobs');
const { ENV, isProduction } = require('./utils/envConfig');

const lrRoutes = require('./routes/lrRoutes'); // Legacy
const axios = require('axios');
const voucherRoutes = require('./routes/voucherRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const cashbookRoutes = require('./routes/cashbookRoutes');
const stockRoutes = require('./routes/stockRoutes'); // JK Super Dump stock
const kosliLrRoutes = require('./routes/kosliLrRoutes');
const jhajjarLrRoutes = require('./routes/jhajjarLrRoutes');
const kosliStockRoutes = require('./routes/kosliStockRoutes');
const jhajjarStockRoutes = require('./routes/jhajjarStockRoutes');
const bahadurgarhLrRoutes = require('./routes/bahadurgarhLrRoutes');
const bahadurgarhStockRoutes = require('./routes/bahadurgarhStockRoutes');
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
const vehicleAdvanceRoutes = require('./routes/vehicleAdvanceRoutes');
const freightBatchRoutes = require('./routes/freightBatchRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
const profileRoutes = require('./routes/profileRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const { requireAuth } = require('./middleware/auth');
const auditRoutes = require('./routes/auditRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');

// Run migrations on startup.
stockService.init();

const helmet = require('helmet');
const app = express();

// Cloud Run / App Hosting puts exactly one proxy in front of us. Without this,
// req.ip is the load balancer's address for every request, so express-rate-limit
// buckets all users together and one attacker locks everybody out.
// Keep it at 1 hop — `true` would trust a client-supplied X-Forwarded-For.
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    contentSecurityPolicy: false, // disabled — frontend handles CSP via meta tags
    crossOriginEmbedderPolicy: false,
}));

// CORS — explicit allowlist. Note the patterns are anchored: a substring match
// like origin.includes('vgtc-management') would also accept
// https://evil-vgtc-management.attacker.com, and endsWith('.hosted.app')
// would accept any other tenant on Firebase App Hosting.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

// Hostname of the App Hosting backend, e.g. "vgtc-management" — its live URLs
// look like vgtc-management--<hash>.<region>.hosted.app.
const APP_HOSTING_BACKEND = process.env.APP_HOSTING_BACKEND || 'vgtc-management';

const isAllowedOrigin = (origin) => {
    if (ALLOWED_ORIGINS.includes(origin)) return true;

    let host, protocol;
    try {
        ({ hostname: host, protocol } = new URL(origin));
    } catch {
        return false; // unparseable Origin header
    }
    if (protocol !== 'https:') return false; // plain-http origins only via ALLOWED_ORIGINS

    // Own domain and its subdomains. The leading dot matters: it anchors the
    // match to a label boundary, so "notvgtc.site" cannot pass.
    if (host === 'vgtc.site' || host.endsWith('.vgtc.site')) return true;

    // Our own App Hosting backend only, not every *.hosted.app tenant.
    if (host.endsWith('.hosted.app')) {
        const firstLabel = host.split('.')[0];
        if (firstLabel === APP_HOSTING_BACKEND ||
            firstLabel.startsWith(`${APP_HOSTING_BACKEND}--`)) return true;
    }

    return false;
};

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin, curl, mobile webview
        if (isAllowedOrigin(origin)) return cb(null, true);
        console.warn(`[CORS] Blocked origin: ${origin}`);
        return cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
}));

// Reduced payload limit (was 50mb — unnecessary for this app)
app.use(express.json({ limit: '10mb' }));

const partyRoutes = require('./routes/partyRoutes');

app.use('/api/kosli/lr', requireAuth, kosliLrRoutes);
app.use('/api/jhajjar/lr', requireAuth, jhajjarLrRoutes);
app.use('/api/bahadurgarh/lr', requireAuth, bahadurgarhLrRoutes);
app.use('/api/vouchers', requireAuth, voucherRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cashbook', requireAuth, cashbookRoutes);
// JK Super Dump stock. The router was written and required but never mounted,
// so every /api/stock call 404'd while the four per-plant routers worked.
app.use('/api/stock', requireAuth, stockRoutes);
app.use('/api/kosli/stock', requireAuth, kosliStockRoutes);
app.use('/api/jhajjar/stock', requireAuth, jhajjarStockRoutes);
app.use('/api/bahadurgarh/stock', requireAuth, bahadurgarhStockRoutes);
app.use('/api/sell', requireAuth, sellRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/lr', requireAuth, lrRoutes); // Legacy JK Super route
app.use('/api/labour', labourRoutes);
app.use('/api/parties', requireAuth, partyRoutes);
app.use('/api/audit', auditRoutes);

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
app.use('/api/vehicle-advances', requireAuth, vehicleAdvanceRoutes);
app.use('/api/freight-batches', requireAuth, freightBatchRoutes);
app.use('/api/stock-transfers', requireAuth, stockTransferRoutes);
app.use('/api/mileage', requireAuth, mileageRoutes);
app.use('/api/profiles', requireAuth, profileRoutes);
app.use('/api/payments', requireAuth, paymentRoutes);
app.use('/api/maintenance', requireAuth, maintenanceRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/tolls', requireAuth, require('./routes/tollRoutes'));
app.use('/api/tyres', requireAuth, require('./routes/tyreRoutes'));
app.use('/api/vendors', requireAuth, require('./routes/vendorRoutes'));
// attendanceRoutes applies requirePermission('attendance', …) internally, which
// already runs requireAuth — mounting it again here would verify the JWT twice.
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/settings', requireAuth, require('./routes/systemSettingsRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes')); // guarded by X-Cron-Secret

// Liveness/readiness probe. Reports 503 when Firestore is not connected so a
// broken deploy is visible to uptime checks instead of quietly serving pages.
app.get('/healthz', (req, res) => {
    const { isAvailable } = require('./firebase');
    const dbUp = isAvailable();
    res.status(dbUp ? 200 : 503).json({
        status: dbUp ? 'ok' : 'degraded',
        env: ENV,
        database: dbUp ? 'firestore' : 'unavailable',
        timestamp: new Date().toISOString(),
    });
});

const PORT = process.env.PORT || 5000;

const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

app.get('/', async (req, res, next) => {
    const code = req.query.code;
    const error = req.query.error;

    if (!code && !error) {
        return next();
    }

    if (error) {
        const safeError = escapeHtml(error);
        return res.send(`<html><body><script>
            if (window.opener) { window.opener.postMessage({ type: 'oauth-error', msg: 'Authorization failed' }, '*'); window.close(); }
        </script><p>Authorization failed: ${safeError}</p></body></html>`);
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
            </script><p style="font-family:sans-serif;padding:40px;text-align:center;color:#f43f5e">&#x274c; Authorization failed.</p></body></html>`);
        }
    }

    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from Vite build in production/App Hosting
const path = require('path');
app.use(express.static(path.join(__dirname, '../client/dist')));

// Unknown API paths must fail loudly. Without this they fall through to the SPA
// catch-all below and return index.html with a 200, so a client calling an
// endpoint this server does not have (a stale process, a typo, a renamed route)
// silently receives HTML where it expected JSON and renders an empty screen.
app.use('/api', (req, res) => {
    res.status(404).json({ error: `No such endpoint: ${req.method} /api${req.path}` });
});

// Catch-all route to serve the React SPA index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Central error handler. Must be last, and must keep all four arguments —
// Express identifies error middleware by arity. Without this, a thrown handler
// error returns Express's default HTML stack trace to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err && /^CORS:/.test(err.message || '')) {
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    console.error('[Error]', req.method, req.originalUrl, '-', err && err.stack ? err.stack : err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
        error: isProduction() ? 'Internal server error' : (err && err.message) || 'Internal server error',
    });
});

// Node 22 terminates the process on an unhandled rejection. Fire-and-forget work
// (background backups, audit logging) could take the whole server down with it.
// Log and keep serving; a real crash-worthy fault still surfaces in the logs.
process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled promise rejection:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Fatal] Uncaught exception:', err && err.stack ? err.stack : err);
});

// In-process cron only works where the process actually stays alive. Cloud Run
// and App Hosting (K_SERVICE) scale to zero, so timers registered here would
// never fire — and with more than one warm instance they would fire twice.
// Those hosts use Cloud Scheduler against /api/jobs/* instead; see jobRoutes.js.
const IS_SERVERLESS = !!process.env.K_SERVICE;
const CRON_TZ = process.env.CRON_TIMEZONE || 'Asia/Kolkata';

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);

    if (IS_SERVERLESS) {
        console.log('[Cron] Serverless host detected — in-process schedules disabled.');
        console.log('[Cron] Trigger jobs via Cloud Scheduler: POST /api/jobs/weekly-backup, /api/jobs/daily-alerts');
        return;
    }

    // Weekly Drive backup: every Sunday at 00:00
    cron.schedule('0 0 * * 0', () => jobs.weeklyBackup(), { timezone: CRON_TZ });

    // Daily fleet alerts: every day at 09:00
    cron.schedule('0 9 * * *', () => jobs.dailyAlerts(), { timezone: CRON_TZ });

    console.log(`[Cron] In-process schedules registered (timezone: ${CRON_TZ}).`);
});

module.exports = app;
