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

apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register the router under all possible base paths
app.use('/api', apiRouter);
app.use('/.netlify/functions/api', apiRouter);
app.use('/', apiRouter); // Fallback

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
