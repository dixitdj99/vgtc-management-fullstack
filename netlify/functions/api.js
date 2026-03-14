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

app.use('/api/lr', lrRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cashbook', cashbookRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/jkl/lr', jklLrRoutes);
app.use('/api/jkl/stock', jklStockRoutes);
app.use('/api/jkl/cashbook', jklCashbookRoutes);
app.use('/api/vehicles', vehicleRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const handler = serverless(app);

module.exports.handler = async (event, context) => {
    console.log('[Netlify] Incoming:', event.httpMethod, event.path);
    return handler(event, context);
};
