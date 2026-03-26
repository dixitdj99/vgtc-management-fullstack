const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');

// Load env vars
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'server', '.env') });

const lrRoutes = require('../../server/routes/lrRoutes');
const voucherRoutes = require('../../server/routes/voucherRoutes');
const authRoutes = require('../../server/routes/authRoutes');
const userRoutes = require('../../server/routes/userRoutes');
const cashbookRoutes = require('../../server/routes/cashbookRoutes');
const stockRoutes = require('../../server/routes/stockRoutes');
const jklLrRoutes = require('../../server/routes/jklLrRoutes');
const jklStockRoutes = require('../../server/routes/jklStockRoutes');
const jklCashbookRoutes = require('../../server/routes/jklCashbookRoutes');
const vehicleRoutes = require('../../server/routes/vehicleRoutes');
const sellRoutes = require('../../server/routes/sellRoutes');
const mileageRoutes = require('../../server/routes/mileageRoutes');
const backupRoutes = require('../../server/routes/backupRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Main router to handle various possible prefixes
const apiRouter = express.Router();

apiRouter.use('/lr', lrRoutes);
apiRouter.use('/vouchers', voucherRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/cashbook', cashbookRoutes);
apiRouter.use('/stock', stockRoutes);
apiRouter.use('/jkl/lr', jklLrRoutes);
apiRouter.use('/jkl/stock', jklStockRoutes);
apiRouter.use('/jkl/cashbook', jklCashbookRoutes);
apiRouter.use('/vehicles', vehicleRoutes);
apiRouter.use('/sell', sellRoutes);
apiRouter.use('/mileage', mileageRoutes);
apiRouter.use('/backup', backupRoutes);

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

module.exports.handler = async (event, context) => {
    console.log('[Netlify] Incoming:', event.httpMethod, event.path);
    return handler(event, context);
};
