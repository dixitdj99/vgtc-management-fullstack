const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');
const path = require('path');
const fs = require('fs');

// GET /api/public/receipt/:truckNo/:date
// Org is always fixed to 'vgtc' — never sourced from the caller.
router.get('/receipt/:truckNo/:date', async (req, res) => {
    try {
        const { truckNo, date } = req.params;
        const orgId = 'vgtc';
        const vouchers = await voucherService.getVouchersByTruckAndDate(orgId, truckNo, date);
        
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
        res.status(500).json({ error: 'Unable to fetch receipt. Please try again.' });
    }
});

// GET /api/public/terminal.apk — Direct download of compiled terminal APK
router.get('/terminal.apk', (req, res) => {
    const apkFile = path.join(__dirname, '..', '..', 'android-terminal', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (!fs.existsSync(apkFile)) {
        return res.status(404).json({ error: 'APK not compiled yet' });
    }
    res.download(apkFile, 'vgtc-terminal.apk');
});

module.exports = router;
