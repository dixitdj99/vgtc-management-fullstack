const { createVehicle } = require('./services/vehicleService');
const { createLoadingReceipt } = require('./services/lrService');
const { createVoucher } = require('./services/voucherService');
const localStore = require('./utils/localStore');
const { isAvailable } = require('./firebase');

async function populate() {
    console.log('--- POPULATING DUMMY DATA ---');
    console.log('Database Mode:', isAvailable() ? 'Firebase' : 'Local');

    // 1. Vehicles
    const trucks = [
        { truckNo: 'HR-63-A-1111', ownerName: 'Ashok Kumar', ownerContact: '9876543210', type: '10 Wheeler', bankDetails: 'SBI 123456789' },
        { truckNo: 'RJ-14-GH-2222', ownerName: 'Rajesh Sharma', ownerContact: '9812345678', type: '12 Wheeler', bankDetails: 'HDFC 987654321' },
        { truckNo: 'UP-16-BT-3333', ownerName: 'Vikram Singh', ownerContact: '9900112233', type: '6 Wheeler', bankDetails: 'PNB 456789012' }
    ];

    console.log('Creating vehicles...');
    for (const t of trucks) {
        await createVehicle(t);
    }

    // 2. LRs and Vouchers
    const today = new Date();
    const lrs = [
        {
            truckNo: 'HR-63-A-1111',
            date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            partyName: 'Ambuja Cements',
            destination: 'Palwal',
            materials: [{ type: 'Cement', weight: 25.4, bags: 500, billing: 'Yes' }],
            type: 'Dump',
            voucherData: {
                weight: 25.4, rate: 1100, advanceDiesel: 5000, advanceCash: 2000, 
                advanceOnline: 3000, isDieselVerified: true, isOnlinePaid: true,
                munshi: 100, shortage: 50, paidBalance: 0
            }
        },
        {
            truckNo: 'RJ-14-GH-2222',
            date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            partyName: 'L&T Construction',
            destination: 'Jaipur',
            materials: [{ type: 'Iron Bars', weight: 30.15, bags: 0, billing: 'No' }],
            type: 'JK_Super',
            voucherData: {
                weight: 30.15, rate: 1250, advanceDiesel: 8000, advanceCash: 5000, 
                advanceOnline: 0, isDieselVerified: false, isOnlinePaid: false,
                munshi: 200, shortage: 0, paidBalance: 0
            }
        },
        {
            truckNo: 'UP-16-BT-3333',
            date: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            partyName: 'Reliance Retail',
            destination: 'Noida',
            materials: [{ type: 'Groceries', weight: 12.5, bags: 400, billing: 'Yes' }],
            type: 'JK_Lakshmi',
            voucherData: {
                weight: 12.5, rate: 900, advanceDiesel: 'FULL', isFullTank: true, 
                advanceCash: 1000, advanceOnline: 1000, isDieselVerified: true, isOnlinePaid: true,
                munshi: 50, shortage: 20, paidBalance: 0
            }
        },
        // A fully paid one
        {
            truckNo: 'HR-63-A-1111',
            date: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            partyName: 'Birla Gold',
            destination: 'Gurgaon',
            materials: [{ type: 'Cement', weight: 20.0, bags: 400, billing: 'Yes' }],
            type: 'Dump',
            voucherData: {
                weight: 20.0, rate: 1000, advanceDiesel: 4000, advanceCash: 2000, 
                advanceOnline: 0, isDieselVerified: true, isOnlinePaid: false,
                munshi: 100, shortage: 0, paidBalance: 13900, paymentClearedDate: today.toISOString().split('T')[0]
            }
        }
    ];

    console.log('Creating LRs and matching Vouchers...');
    for (const item of lrs) {
        // Create LR
        const lrResult = await createLoadingReceipt({
            truckNo: item.truckNo,
            date: item.date,
            partyName: item.partyName,
            destination: item.destination,
            materials: item.materials,
            billing: item.materials[0].billing
        }, item.type === 'JK_Lakshmi' ? 'jkl_loading_receipts' : 'loading_receipts');

        // Create Voucher
        const total = (item.voucherData.weight || 0) * (item.voucherData.rate || 0);
        await createVoucher({
            ...item.voucherData,
            truckNo: item.truckNo,
            date: item.date,
            lrNo: lrResult.lrNo,
            total,
            destination: item.destination,
            partyName: item.partyName,
            type: item.type,
            status: 'Loaded'
        });
    }

    // 3. Stock Additions
    console.log('Creating Stock additions...');
    const stockCols = ['stock_additions', 'jkl_stock_additions'];
    for (const col of stockCols) {
        if (isAvailable()) {
            await createInCollection(col, { date: today.toISOString().split('T')[0], material: 'Cement', qty: 1000, truckNo: 'HR-63-A-1111', challanNo: 'CH-123' });
        } else {
            localStore.insert(col, { date: today.toISOString().split('T')[0], material: 'Cement', qty: 1000, truckNo: 'RJ-14-GH-2222', challanNo: 'CH-999' });
        }
    }

    // 4. Cashbook
    console.log('Creating Cashbook entries...');
    const cashCols = ['cashbook', 'jkl_cashbook'];
    for (const col of cashCols) {
        if (isAvailable()) {
            await createInCollection(col, { date: today.toISOString().split('T')[0], amount: 50000, type: 'Deposit', party: 'Bank', mode: 'Online', remarks: 'Opening Balance' });
        } else {
            localStore.insert(col, { date: today.toISOString().split('T')[0], amount: 500, type: 'Cash Out', party: 'Stationary', mode: 'Cash', remarks: 'Pen/Paper' });
        }
    }

    console.log('--- DONE ---');
}

async function createInCollection(col, data) {
    const { db, admin } = require('./firebase');
    const ref = db.collection(col).doc();
    await ref.set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
}

populate().catch(console.error).finally(() => process.exit(0));
