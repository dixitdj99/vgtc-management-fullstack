const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');

// Load env vars
require('dotenv').config();

// Force rebuild - 2026-05-07 17:10

const lrRoutes = require('../../server/routes/lrRoutes');
const voucherRoutes = require('../../server/routes/voucherRoutes');
const authRoutes = require('../../server/routes/authRoutes');
const userRoutes = require('../../server/routes/userRoutes');
const cashbookRoutes = require('../../server/routes/cashbookRoutes');
const stockRoutes = require('../../server/routes/stockRoutes');
const kosliLrRoutes = require('../../server/routes/kosliLrRoutes');
const jhajjarLrRoutes = require('../../server/routes/jhajjarLrRoutes');
const kosliStockRoutes = require('../../server/routes/kosliStockRoutes');
const jhajjarStockRoutes = require('../../server/routes/jhajjarStockRoutes');
const bahadurgarhLrRoutes = require('../../server/routes/bahadurgarhLrRoutes');
const bahadurgarhStockRoutes = require('../../server/routes/bahadurgarhStockRoutes');
const jklLrRoutes = require('../../server/routes/jklLrRoutes');
const jklStockRoutes = require('../../server/routes/jklStockRoutes');
const jklCashbookRoutes = require('../../server/routes/jklCashbookRoutes');
const vehicleRoutes = require('../../server/routes/vehicleRoutes');
const sellRoutes = require('../../server/routes/sellRoutes');
const mileageRoutes = require('../../server/routes/mileageRoutes');
const backupRoutes = require('../../server/routes/backupRoutes');
const publicRoutes = require('../../server/routes/publicRoutes');
const labourRoutes = require('../../server/routes/labourRoutes');
const partyRoutes = require('../../server/routes/partyRoutes');
const vehicleAdvanceRoutes = require('../../server/routes/vehicleAdvanceRoutes');
const stockTransferRoutes = require('../../server/routes/stockTransferRoutes');
const profileRoutes = require('../../server/routes/profileRoutes');
const paymentRoutes = require('../../server/routes/paymentRoutes');
const maintenanceRoutes = require('../../server/routes/maintenanceRoutes');
const tollRoutes = require('../../server/routes/tollRoutes');
const { requireAuth } = require('../../server/middleware/auth');
const orgRoutes = require('../../server/routes/orgRoutes');

const app = express();

// CORS — open on Netlify (same-domain app; JWT provides auth security)
// Configure ALLOWED_ORIGINS env var to restrict if needed
app.use(cors({
    origin: (origin, cb) => {
        // Allow no origin (same-origin requests, server-to-server)
        if (!origin) return cb(null, true);
        // If ALLOWED_ORIGINS is set, enforce it
        if (process.env.ALLOWED_ORIGINS) {
            const allowed = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
            return allowed.includes(origin) ? cb(null, true) : cb(new Error('CORS: origin not allowed'));
        }
        // Default: allow all (this is an internal app protected by JWT)
        return cb(null, true);
    },
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Main router to handle various possible prefixes
const apiRouter = express.Router();

apiRouter.use('/kosli/lr', requireAuth, kosliLrRoutes);
apiRouter.use('/jhajjar/lr', requireAuth, jhajjarLrRoutes);
apiRouter.use('/bahadurgarh/lr', requireAuth, bahadurgarhLrRoutes);
apiRouter.use('/vouchers', requireAuth, voucherRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/cashbook', requireAuth, cashbookRoutes);
apiRouter.use('/kosli/stock', requireAuth, kosliStockRoutes);
apiRouter.use('/jhajjar/stock', requireAuth, jhajjarStockRoutes);
apiRouter.use('/bahadurgarh/stock', requireAuth, bahadurgarhStockRoutes);
apiRouter.use('/sell', requireAuth, sellRoutes);
apiRouter.use('/backup', backupRoutes);
apiRouter.use('/public', publicRoutes);
apiRouter.use('/lr', requireAuth, lrRoutes); // Legacy JK Super route
apiRouter.use('/labour', labourRoutes);
apiRouter.use('/stock', requireAuth, stockRoutes); // Legacy
apiRouter.use('/org', requireAuth, orgRoutes);
apiRouter.use('/parties', requireAuth, partyRoutes);
apiRouter.use('/maintenance', requireAuth, maintenanceRoutes);
apiRouter.use('/tolls', requireAuth, tollRoutes);
apiRouter.use('/profiles', requireAuth, profileRoutes);
apiRouter.use('/payments', requireAuth, paymentRoutes);
apiRouter.use('/vehicle-advances', requireAuth, vehicleAdvanceRoutes);
apiRouter.use('/stock-transfers', requireAuth, stockTransferRoutes);

// JKL Routes
apiRouter.use('/jkl/lr', requireAuth, jklLrRoutes);
apiRouter.use('/jkl/stock', requireAuth, jklStockRoutes);
apiRouter.use('/jkl/cashbook', requireAuth, jklCashbookRoutes);
apiRouter.use('/vehicles', requireAuth, vehicleRoutes);
apiRouter.use('/mileage', requireAuth, mileageRoutes);

// Root route for base URL pings
apiRouter.all('/', (req, res) => {
    res.json({
        message: 'VGTC API is running',
        endpoints: [
            '/auth/status',
            '/vouchers',
            '/lr',
            '/stock',
            '/cashbook',
            '/vehicles'
        ]
    });
});

apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register the router under all possible base paths
app.use('/.netlify/functions/api', apiRouter);
app.use('/api', apiRouter);

// Root route handler for Google Auth Landing Page in production
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
    // Fallback to apiRouter root if no code
    res.json({ message: 'VGTC API is running' });
});

app.use('/', apiRouter); // Fallback for other paths

// Catch-all for debugging
app.use((req, res) => {
    console.warn(`[Netlify] 404 at ${req.path}`);
    res.status(404).json({ error: 'Not Found', path: req.path });
});

const handler = serverless(app);

// Force rebuild - 2026-05-07 16:30
module.exports.handler = async (event, context) => {
    console.log('[Netlify] Incoming:', event.httpMethod, event.path);
    return handler(event, context);
};
