const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const jobs = require('./jobs');
const { ENV, isProduction } = require('./utils/envConfig');
const { captureMetaWebhookBody, verifyMetaWebhookSignature } = require('./middleware/metaWebhookSignature');

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
const { requireAuth, requireAdmin } = require('./middleware/auth');
// Permissions are enforced here, at the mounts, so the whole mapping reads in
// one place. See middleware/permissionGate.js.
const { gate } = require('./middleware/permissionGate');
const auditRoutes = require('./routes/auditRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const reportRoutes = require('./routes/reportRoutes');

// Run migrations on startup.
stockService.init();

// Startup security check — fail early if JWT_SECRET is absent or is the
// known-bad placeholder. auth.js also checks at require-time, but doing it
// here makes the intent explicit at the server entry point.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'vgtc-dev-secret-change-in-prod') {
    console.error('[SECURITY] JWT_SECRET is missing or is the default placeholder. Set a real secret.');
    process.exit(1);
}

// Trusted origin for postMessage calls — set APP_ORIGIN in .env for non-default deployments.
const trustedOrigin = process.env.APP_ORIGIN || 'https://vgtc.site';

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

const isPrivateHost = (host) => (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
);

const isAllowedOrigin = (origin) => {
    if (ALLOWED_ORIGINS.includes(origin)) return true;

    let host, protocol;
    try {
        ({ hostname: host, protocol } = new URL(origin));
    } catch {
        return false; // unparseable Origin header
    }

    // Allow local and LAN network device access (e.g. mobile/tablet testing on Wi-Fi)
    if (isPrivateHost(host)) return true;

    if (protocol !== 'https:') return false; // plain-http origins only via ALLOWED_ORIGINS or private LAN

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

/**
 * A page this server itself served is trivially trusted, whatever port it is
 * on. Worth stating explicitly: the landing page posts its enquiry form back to
 * /api/enquiry, and a browser attaches an Origin header to a form submission
 * even when it is same-origin — so without this the server rejected a request
 * from a page it had just handed out, on any port not in the dev list.
 */
const isSameOrigin = (origin, req) => {
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
};

app.use(cors((req, done) => done(null, {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin, curl, mobile webview
        if (isSameOrigin(origin, req) || isAllowedOrigin(origin)) return cb(null, true);
        console.warn(`[CORS] Blocked origin: ${origin}`);
        return cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
})));

// Reduced payload limit (was 50mb — unnecessary for this app)
app.use(express.json({ limit: '10mb', verify: captureMetaWebhookBody }));

// ── Observability Telemetry & Live Request Logger ──
const API_LOG_MAX = 250;
const apiCallLogs = [];
const routeMetrics = new Map();
const outcomeCounters = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
const recentDurations = [];

app.use((req, res, next) => {
    const isMonitored = req.path.startsWith('/api') || req.path.startsWith('/health');
    if (!isMonitored) return next();

    const start = Date.now();
    const originalEnd = res.end;
    res.end = function (...args) {
        const duration = Date.now() - start;
        const status = res.statusCode;

        if (status >= 200 && status < 300) outcomeCounters['2xx']++;
        else if (status >= 300 && status < 400) outcomeCounters['3xx']++;
        else if (status >= 400 && status < 500) outcomeCounters['4xx']++;
        else if (status >= 500) outcomeCounters['5xx']++;
        else outcomeCounters.other++;

        const cleanPath = (req.baseUrl || '') + (req.path || '').split('?')[0];
        const routeKey = `${req.method} ${cleanPath}`;
        const currentRoute = routeMetrics.get(routeKey) || { route: cleanPath, method: req.method, calls: 0, errors: 0, totalMs: 0 };
        currentRoute.calls++;
        currentRoute.totalMs += duration;
        if (status >= 400) currentRoute.errors++;
        routeMetrics.set(routeKey, currentRoute);

        recentDurations.push(duration);
        if (recentDurations.length > 300) recentDurations.shift();

        const logEntry = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl || req.url,
            status,
            durationMs: duration,
            ip: (req.headers['x-forwarded-for'] || req.ip || '127.0.0.1').split(',')[0].trim(),
            userAgent: (req.headers['user-agent'] || '').substring(0, 80),
        };
        apiCallLogs.unshift(logEntry);
        if (apiCallLogs.length > API_LOG_MAX) apiCallLogs.pop();

        return originalEnd.apply(this, args);
    };
    next();
});

const partyRoutes = require('./routes/partyRoutes');

app.use('/api/kosli/lr', requireAuth, gate(['lr_dump','bill_kosli']), kosliLrRoutes);
app.use('/api/jhajjar/lr', requireAuth, gate(['lr_dump','bill_jhajjar']), jhajjarLrRoutes);
app.use('/api/bahadurgarh/lr', requireAuth, gate(['lr_dump','bill_bahadurgarh']), bahadurgarhLrRoutes);
app.use('/api/vouchers', requireAuth, gate(['voucher_jkl_dump','voucher_jkl','voucher_jksuper','balance_kosli','balance_jhajjar','balance_bahadurgarh','balance_jksuper','balance_jkl_dump','balance_jkl']), voucherRoutes);
app.use('/api/sheets', requireAuth, require('./routes/sheetRoutes'));
// TODO: audit GET /api/auth/status — it should return only { status: 'ok' } to
// unauthenticated callers. Move env/infra details to a separate authenticated
// admin endpoint. See routes/authRoutes.js.
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cashbook', requireAuth, gate('cashbook'), cashbookRoutes);
// JK Super Dump stock. The router was written and required but never mounted,
// so every /api/stock call 404'd while the four per-plant routers worked.
app.use('/api/stock', requireAuth, gate(['stock_kosli','stock_jhajjar','stock_bahadurgarh']), stockRoutes);
app.use('/api/kosli/stock', requireAuth, gate('stock_kosli'), kosliStockRoutes);
app.use('/api/jhajjar/stock', requireAuth, gate('stock_jhajjar'), jhajjarStockRoutes);
app.use('/api/bahadurgarh/stock', requireAuth, gate('stock_bahadurgarh'), bahadurgarhStockRoutes);
app.use('/api/sell', requireAuth, gate('sell'), sellRoutes);
app.use('/api/backup', requireAuth, requireAdmin, backupRoutes);
app.use('/api/public', publicRoutes);
// The landing page's "work with us" form. Public by necessity — it is the one
// door a stranger can knock on, so the router carries its own honeypot, rate
// limit and field caps, and guards its read side with requireAuth.
app.use('/api/enquiry', require('./routes/enquiryRoutes'));
app.use('/api/lr', requireAuth, gate(['lr_dump','bill_kosli','bill_jhajjar','bill_bahadurgarh']), lrRoutes); // Legacy JK Super route
app.use('/api/labour', requireAuth, labourRoutes);
app.use('/api/parties', requireAuth, partyRoutes);
app.use('/api/destinations', requireAuth, require('./routes/destinationRoutes'));
app.use('/api/audit', requireAuth, requireAdmin, auditRoutes);

// Weather Proxy to avoid CORS
app.get('/api/weather', async (req, res) => {
  try {
    // Sanitize city to letters, spaces, and hyphens only — prevents SSRF via path injection.
    const city = ((req.query.city || 'Ahmedabad') + '').replace(/[^a-zA-Z\s\-]/g, '').trim().slice(0, 60) || 'Ahmedabad';
    // 5 second timeout for weather proxy
    const response = await axios.get(`https://wttr.in/${city}?format=j1`, { timeout: 5000 });
    res.json(response.data);
  } catch (error) {
    console.error('Weather Proxy Error:', error.message);
    res.status(502).json({ error: 'Weather service temporarily unavailable' });
  }
});

// JKL Routes
app.use('/api/jkl/lr', requireAuth, gate('lr_jkl'), jklLrRoutes);
app.use('/api/jkl/stock', requireAuth, gate('stock_jkl'), jklStockRoutes);
app.use('/api/jkl/cashbook', requireAuth, gate('cashbook'), jklCashbookRoutes);
app.use('/api/vehicles', requireAuth, gate(['vehicle', 'market_vehicle', 'voucher_jkl', 'voucher_jkl_dump', 'voucher_jksuper', 'voucher_kosli', 'voucher_jhajjar', 'voucher_bahadurgarh', 'lr_jkl', 'lr_dump', 'lr_kosli', 'lr_jhajjar', 'lr_bahadurgarh', 'cashbook', 'pay', 'balance_all']), vehicleRoutes);
app.use('/api/vehicle-advances', requireAuth, gate(['pay','vehicle']), vehicleAdvanceRoutes);
app.use('/api/freight-batches', requireAuth, gate('pay'), freightBatchRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
// Reads the loading receipts and MIGO entries of all five plants to price the
// labour's work, so it is gated on `pay` rather than on ten separate lr_*/stock_* keys.
app.use('/api/labour-account', requireAuth, gate('pay'), require('./routes/labourAccountRoutes'));
app.use('/api/stock-transfers', requireAuth, gate(['stock_kosli','stock_jhajjar','stock_bahadurgarh','stock_jkl']), stockTransferRoutes);
app.use('/api/mileage', requireAuth, gate('mileage'), mileageRoutes);
app.use('/api/profiles', requireAuth, profileRoutes);
app.use('/api/payments', requireAuth, gate('pay'), paymentRoutes);
app.use('/api/maintenance', requireAuth, gate('vehicle'), maintenanceRoutes);
// requireAuth first: the gate reads req.user, and invoiceRoutes applies its own
// auth internally, which would be too late for the gate to see it.
app.use('/api/invoices', requireAuth, gate('invoice'), invoiceRoutes);
// Files a copy of whatever a module just printed. No permission gate beyond
// requireAuth: it archives what the user was already allowed to produce, and
// gating it per module would mean a lookup table that drifts from the modules.
app.use('/api/archive', requireAuth, require('./routes/archiveRoutes'));
// One NIC feed serves every plant's challan screen, so it gates on any stock key
// rather than a plant-specific one.
app.use('/api/eway', requireAuth, gate(['stock_kosli','stock_jhajjar','stock_bahadurgarh','stock_jkl']), require('./routes/ewayRoutes'));
app.use('/api/tolls', requireAuth, gate('vehicle'), require('./routes/tollRoutes'));
app.use('/api/tyres', requireAuth, gate('vehicle'), require('./routes/tyreRoutes'));
app.use('/api/vendors', requireAuth, gate('vehicle'), require('./routes/vendorRoutes'));
// attendanceRoutes applies requirePermission('attendance', …) internally, which
// already runs requireAuth — mounting it again here would verify the JWT twice.
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/settings', requireAuth, require('./routes/systemSettingsRoutes'));
// Meta signs POST bodies with the app secret. GET challenge remains public.
app.use('/api/whatsapp/webhook', verifyMetaWebhookSignature, require('./routes/whatsappWebhookRoute'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsappRoutes'));
app.use('/api/notifications', requireAuth, require('./routes/notificationRoutes'));
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

app.get('/health', (req, res) => {
    const { isAvailable } = require('./firebase');
    const dbUp = isAvailable();
    res.status(dbUp ? 200 : 503).json({
        status: dbUp ? 'ok' : 'degraded',
        env: ENV,
        database: dbUp ? 'firestore' : 'unavailable',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/system/status', async (req, res) => {
    const { isAvailable } = require('./firebase');
    const { ENV, getEnvPrefix } = require('./utils/envConfig');
    const dbUp = isAvailable();
    let waConfig = {};
    try {
        const { getWhatsAppConfig } = require('./utils/whatsappService');
        waConfig = getWhatsAppConfig();
    } catch (_) {}

    res.json({
        status: 'operational',
        appEnv: ENV,
        collectionPrefix: getEnvPrefix() || '(none — production)',
        database: dbUp ? 'Firestore' : 'LocalStore (Fallback)',
        firebaseConnected: dbUp,
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        node: process.version,
        whatsapp: {
            enabled: waConfig.enabled || false,
            phoneNumberId: waConfig.phoneNumberId || '1216388781567509',
            wabaId: waConfig.wabaId || '1552863822720100',
            provider: waConfig.provider || 'meta'
        },
        timestamp: new Date().toISOString()
    });
});

let cachedTableStats = null;
let lastTableStatsFetch = 0;

app.get('/api/system/database-tables', async (req, res) => {
    const now = Date.now();
    if (cachedTableStats && (now - lastTableStatsFetch < 10000)) {
        return res.json(cachedTableStats);
    }

    const { db, isAvailable } = require('./firebase');
    const { ENV, getEnvPrefix } = require('./utils/envConfig');
    const prefix = getEnvPrefix();

    const TABLE_DEFS = [
        { name: 'vouchers', category: 'Accounting', desc: 'Trip vouchers, billing & freight balances' },
        { name: 'kosli_challans', category: 'Logistics', desc: 'Kosli Godown outward challan records' },
        { name: 'jhajjar_challans', category: 'Logistics', desc: 'Jhajjar Godown outward challan records' },
        { name: 'vehicles', category: 'Fleet', desc: 'Own & Market fleet vehicle registration & tyres' },
        { name: 'profiles', category: 'Operations', desc: 'Staff, Munshi, Drivers and Cleaner profiles' },
        { name: 'labour_workers', category: 'Labour', desc: 'Registered godown labour roster' },
        { name: 'labour_attendance', category: 'Labour', desc: 'Daily attendance and wage entries' },
        { name: 'fuel_logs', category: 'Fleet', desc: 'Diesel dispense and fuel pump records' },
        { name: 'cash_advances', category: 'Accounting', desc: 'Driver road cash advances and settlement' },
        { name: 'lr_records', category: 'Logistics', desc: 'Consignment lorry receipts and goods metadata' },
        { name: 'audit_logs', category: 'Security', desc: 'User activity, ledger modifications & logins' },
        { name: 'parties', category: 'Accounting', desc: 'Client billing parties and vendor ledger' },
        { name: 'tyre_inventory', category: 'Fleet', desc: 'Tyre serial numbers, positions & history' },
        { name: 'backups', category: 'System', desc: 'Automated Google Drive snapshots' }
    ];

    if (!isAvailable()) {
        const tables = TABLE_DEFS.map(t => ({
            ...t,
            collectionName: prefix + t.name,
            count: 0,
            status: 'offline',
            engine: 'Fallback Store',
            lastSync: new Date().toISOString()
        }));
        return res.json({ tables, totalDocs: 0, totalTables: tables.length, env: ENV, prefix });
    }

    try {
        const results = await Promise.allSettled(
            TABLE_DEFS.map(async (t) => {
                const colKey = prefix + t.name;
                try {
                    const snap = await db.collection(colKey).count().get();
                    return {
                        ...t,
                        collectionName: colKey,
                        count: snap.data().count,
                        status: 'healthy',
                        engine: 'Firestore NoSQL',
                        lastSync: new Date().toISOString()
                    };
                } catch (e) {
                    return {
                        ...t,
                        collectionName: colKey,
                        count: 0,
                        status: 'healthy',
                        engine: 'Firestore NoSQL',
                        lastSync: new Date().toISOString()
                    };
                }
            })
        );

        const tables = results.map((r, i) => r.status === 'fulfilled' ? r.value : {
            ...TABLE_DEFS[i],
            collectionName: prefix + TABLE_DEFS[i].name,
            count: 0,
            status: 'error',
            engine: 'Firestore NoSQL',
            lastSync: new Date().toISOString()
        });

        const totalDocs = tables.reduce((sum, t) => sum + (t.count || 0), 0);

        cachedTableStats = {
            tables,
            totalDocs,
            totalTables: tables.length,
            env: ENV,
            prefix: prefix || '(none — production)',
            updatedAt: new Date().toISOString()
        };
        lastTableStatsFetch = now;
        res.json(cachedTableStats);
    } catch (err) {
        console.error('Failed to query database table stats:', err);
        res.status(500).json({ error: 'Failed to query table stats' });
    }
});

app.get('/api/system/api-logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 150;
    const filter = (req.query.filter || 'all').toLowerCase();
    const search = (req.query.search || '').toLowerCase();

    let filtered = apiCallLogs;
    if (filter === '2xx') filtered = filtered.filter(l => l.status >= 200 && l.status < 300);
    else if (filter === '3xx') filtered = filtered.filter(l => l.status >= 300 && l.status < 400);
    else if (filter === '4xx') filtered = filtered.filter(l => l.status >= 400 && l.status < 500);
    else if (filter === '5xx') filtered = filtered.filter(l => l.status >= 500);

    if (search) {
        filtered = filtered.filter(l =>
            (l.path && l.path.toLowerCase().includes(search)) ||
            (l.method && l.method.toLowerCase().includes(search)) ||
            (l.ip && l.ip.includes(search)) ||
            String(l.status).includes(search)
        );
    }

    res.json({
        logs: filtered.slice(0, limit),
        totalBuffered: apiCallLogs.length,
        timestamp: new Date().toISOString()
    });
});

app.delete('/api/system/api-logs', (req, res) => {
    apiCallLogs.length = 0;
    res.json({ success: true, message: 'API call logs cleared' });
});

app.get('/api/system/telemetry', (req, res) => {
    const sortedDurations = [...recentDurations].sort((a, b) => a - b);
    const n = sortedDurations.length;
    const p50 = n > 0 ? sortedDurations[Math.floor(n * 0.5)] : 0;
    const p90 = n > 0 ? sortedDurations[Math.floor(n * 0.9)] : 0;
    const p99 = n > 0 ? sortedDurations[Math.floor(n * 0.99)] : 0;
    const max = n > 0 ? sortedDurations[n - 1] : 0;

    const totalRequests = Object.values(outcomeCounters).reduce((a, b) => a + b, 0);
    const errorCount = outcomeCounters['5xx'];
    const errorRate = totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(1) : '0';

    const busiest = Array.from(routeMetrics.values())
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 8)
        .map(r => ({
            ...r,
            avgMs: r.calls > 0 ? Math.round(r.totalMs / r.calls) : 0
        }));

    const slowest = Array.from(routeMetrics.values())
        .filter(r => r.calls > 0)
        .sort((a, b) => (b.totalMs / b.calls) - (a.totalMs / a.calls))
        .slice(0, 8)
        .map(r => ({
            ...r,
            avgMs: Math.round(r.totalMs / r.calls)
        }));

    const now = Date.now();
    const buckets = [];
    for (let i = 14; i >= 0; i--) {
        const bucketStart = now - (i + 1) * 60000;
        const bucketEnd = now - i * 60000;
        const bucketLogs = apiCallLogs.filter(l => {
            const t = new Date(l.timestamp).getTime();
            return t >= bucketStart && t < bucketEnd;
        });

        const timeLabel = new Date(bucketEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        buckets.push({
            time: timeLabel,
            total: bucketLogs.length,
            '2xx': bucketLogs.filter(l => l.status >= 200 && l.status < 300).length,
            '3xx': bucketLogs.filter(l => l.status >= 300 && l.status < 400).length,
            '4xx': bucketLogs.filter(l => l.status >= 400 && l.status < 500).length,
            '5xx': bucketLogs.filter(l => l.status >= 500).length,
        });
    }

    res.json({
        totalRequests,
        requestsPerMinute: (totalRequests / Math.max(1, process.uptime() / 60)).toFixed(1),
        errorRate: `${errorRate}%`,
        outcomes: outcomeCounters,
        latency: { p50, p90, p99, max },
        buckets,
        busiestRoutes: busiest,
        slowestRoutes: slowest,
        memory: process.memoryUsage(),
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
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
            if (window.opener) { window.opener.postMessage({ type: 'oauth-error', msg: 'Authorization failed' }, '${trustedOrigin}'); window.close(); }
        </script><p>Authorization failed: ${safeError}</p></body></html>`);
    }

    if (code) {
        // Auto-exchange the code — no manual copy needed
        const driveService = require('./utils/driveService');
        try {
            await driveService.saveToken(code);
            return res.send(`<html><body><script>
                if (window.opener) {
                    window.opener.postMessage({ type: 'oauth-success' }, '${trustedOrigin}');
                    setTimeout(() => window.close(), 500);
                } else {
                    document.write('<p style="font-family:sans-serif;padding:40px;text-align:center;color:#10b981">&#x2705; Google Drive authorized! You can close this tab.</p>');
                }
            </script><p style="font-family:sans-serif;padding:40px;text-align:center;color:#10b981">&#x2705; Authorized! Closing...</p></body></html>`);
        } catch (e) {
            return res.send(`<html><body><script>
                if (window.opener) { window.opener.postMessage({ type: 'oauth-error', msg: 'Token exchange failed' }, '${trustedOrigin}'); window.close(); }
            </script><p style="font-family:sans-serif;padding:40px;text-align:center;color:#f43f5e">&#x274c; Authorization failed.</p></body></html>`);
        }
    }

    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from Vite build in production/App Hosting
const path = require('path');
/**
 * The public landing page, at /home.
 *
 * The app keeps the root: everyone's bookmark, the PWA and every clerk still
 * land on the login screen at vgtc.site. The marketing page — the only thing on
 * this domain worth indexing — sits at /home, which is the conventional place
 * for it when the application owns the apex.
 *
 * Explicit route rather than letting express.static serve /home.html, so the
 * address people are given has no extension on it.
 */
app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/home.html'));
});

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

    // Daily Own Fleet document expiry alerts (30d, 15d, 5d, 0d, monthly overdue): every day at 09:00
    cron.schedule('0 9 * * *', () => jobs.checkVehicleDocExpiry(), { timezone: CRON_TZ });

    // Daily Own Fleet EMI auto-debit sync (marks elapsed installments as paid on deduction date): every day at 09:00
    cron.schedule('0 9 * * *', () => jobs.syncVehicleEmis(), { timezone: CRON_TZ });

    console.log(`[Cron] In-process schedules registered (timezone: ${CRON_TZ}).`);
});

module.exports = app;
