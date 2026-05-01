const localStore = require('../utils/localStore');
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const vehicleService = require('./vehicleService');

const VOUCHERS_COL = 'vouchers';
const FUEL_LOGS_COL = 'fuel_logs';

const calculateMileageSummary = async (req = {}) => {
    let allDocs = [];
    const vehicles = await vehicleService.getAllVehicles(getCol('vehicles', req));

    if (!isAvailable()) {
        const vouchers = localStore.getAll(VOUCHERS_COL);
        const fuelLogs = localStore.getAll('fuel_logs');
        allDocs = [
            ...vouchers.map(d => ({ ...d, _type: 'voucher' })),
            ...fuelLogs.map(d => ({ ...d, _type: 'fuel_log' }))
        ];
    } else {
        const [vouchersSnap, fuelSnap] = await Promise.all([
            db.collection(getCol(VOUCHERS_COL, req)).get(),
            db.collection(getCol('fuel_logs', req)).get()
        ]);
        
        allDocs = [
            ...vouchersSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'voucher' })),
            ...fuelSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'fuel_log' }))
        ];
    }

    const byTruck = {};
    allDocs.forEach(doc => {
        if (!doc.truckNo) return;
        const cleanNo = doc.truckNo.replace(/\s/g, '').toUpperCase();
        if (!byTruck[cleanNo]) byTruck[cleanNo] = [];
        byTruck[cleanNo].push(doc);
    });

    const result = {};
    Object.entries(byTruck).forEach(([truckNo, trips]) => {
        const sortedAsc = [...trips].sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
            return aTime - bTime;
        });
        
        let lastEndKm = null;
        let totalKm = 0;
        let totalDiesel = 0;
        
        sortedAsc.forEach(t => {
            if (t.endKm && String(t.endKm).trim() !== '') {
                const currKm = parseFloat(t.endKm);
                if (lastEndKm !== null && currKm >= lastEndKm) {
                    totalKm += (currKm - lastEndKm);
                }
                lastEndKm = currKm;
            }
            const amt = parseFloat(t.advanceDiesel) || parseFloat(t.amount) || 0;
            totalDiesel += amt;
        });

        // Find vehicle data to get targetMileage and vehicleType
        const vehicle = vehicles.find(v => v.truckNo.replace(/\s/g, '').toUpperCase() === truckNo);
        let assumedMileage = 3.0; // Default for Trailer
        if (vehicle) {
            if (vehicle.targetMileage && parseFloat(vehicle.targetMileage) > 0) {
                assumedMileage = parseFloat(vehicle.targetMileage);
            } else if (vehicle.vehicleType === 'Canter') {
                assumedMileage = 4.7;
            }
        }

        const totalVoucherLitres = totalDiesel / 90; // Assuming Rs 90/litre
        const fuelConsumed = totalKm / assumedMileage;
        const fuelBalance = totalVoucherLitres - fuelConsumed;

        const avg = totalVoucherLitres > 0 ? (totalKm / totalVoucherLitres).toFixed(2) : 0;
        result[truckNo] = {
            totalKm,
            totalDiesel,
            avg: parseFloat(avg),
            fuelBalance: parseFloat(fuelBalance.toFixed(1)),
            assumedMileage
        };
    });


    return result;
};

module.exports = {
    calculateMileageSummary
};
