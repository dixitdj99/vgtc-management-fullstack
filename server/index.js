const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const lrRoutes = require('./routes/lrRoutes');
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

// Run migrations on startup
stockService.init();

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/lr', lrRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cashbook', cashbookRoutes);
app.use('/api/stock', stockRoutes);

// JKL Routes
app.use('/api/jkl/lr', jklLrRoutes);
app.use('/api/jkl/stock', jklStockRoutes);
app.use('/api/jkl/cashbook', jklCashbookRoutes);
app.use('/api/vehicles', vehicleRoutes);

const PORT = process.env.PORT || 5000;

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV !== 'production' && !process.env.NETLIFY) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
