const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');

// GET /api/public/receipt/:truckNo/:date
router.get('/receipt/:truckNo/:date', async (req, res) => {
    try {
        const { truckNo, date } = req.params;
        const vouchers = await voucherService.getVouchersByTruckAndDate(truckNo, date);
        
        // Sanitize the response to only return necessary summary data for public viewing
        const sanitized = vouchers.map(v => ({
            id: v.id,
            lrNo: v.lrNo,
            date: v.date,
            destination: v.destination || v.partyName,
            type: v.type,
            weight: v.weight,
            rate: v.rate,
            gross: (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0),
            advanceDiesel: v.advanceDiesel,
            dieselAmount: v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0),
            advanceCash: parseFloat(v.advanceCash) || 0,
            advanceOnline: parseFloat(v.advanceOnline) || 0,
            munshi: parseFloat(v.munshi) || 0,
            shortage: parseFloat(v.shortage) || 0,
            paidBalance: parseFloat(v.paidBalance) || 0
        }));

        res.json(sanitized);
    } catch (error) {
        console.error('Public receipt error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
