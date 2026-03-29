const lrService = require('./services/lrService');
const voucherService = require('./services/voucherService');
const { db, isAvailable } = require('./firebase');

const rawData = `VGTC-26/1985	3389938040	HR47G4337	NAHAR ROAD KOSALI	25	5500
VGTC-26/1986	3389938041	HR47G4337	NAHAR ROAD KOSALI	20	4400
VGTC-26/1987	3389939097	HR47F7819	LOHARU ROAD, BHIWANI	42	14868
VGTC-26/1988	3389940492	HR63D9020	JHAJJAR	40	8440
VGTC-26/1999	3389946470	HR63D9020	JHAJJAR	40	8440
VGTC-26/2004	3389948471	HR47F7819	LOHARU ROAD, BHIWANI	42	14868
VGTC-26/2018	3389955154	HR63E1352	BARWALA	7	3318
VGTC-26/2024	3389961811	HR63D9020	JHAJJAR	36	7596
VGTC-26/2027	3389966543	HR47F7819	LOHARU ROAD, BHIWANI	17	5984
VGTC-26/2048	3389983547	HR47F7819	BEHROR	42	17052
VGTC-26/2061	3389984942	HR47G4337	BEHROR	42	17052
VGTC-26/2060	3389984955	HR63E1352	BEHROR	42	17052
VGTC-26/2063	3389987283	HR63D9020	JHAJJAR	40	8440
VGTC-26/2087	3390000475	HR63E9768	LOHARU ROAD, BHIWANI	42	14868
VGTC-26/2088	3390001687	HR47F7819	JHAJJAR	43	9073
VGTC-26/2094	3390008410	HR63E1352	HISAR	42	19278
VGTC-26/2093	3390008437	HR47F7819	BARWALA	42	19908
VGTC-26/2098	3390008854	HR63D9020	JHAJJAR	40	8440
VGTC-26/2102	3390014603	HR63E9632	NARNAUL	42	13482
VGTC-26/2109	3390017228	HR63D9020	JHAJJAR	40	8440
VGTC-26/2107	3390017283	HR47G3060	MAHENDRAGARH	14	4256
VGTC-26/2120	3390025703	HR63D9020	JHAJJAR	40	8440
VGTC-26/2126	3390031494	HR47G0194	LOHARU ROAD, BHIWANI	21	7434
VGTC-26/2127	3390031495	HR47G0194	LOHARU ROAD, BHIWANI	21	7434
VGTC-26/2136	3390039208	HR47G0194	BEHROR	43	17458
VGTC-26/2138	3390042383	HR63D9020	NAHAR ROAD KOSALI	40	8800
VGTC-26/2147	3390049904	HR63D9020	JHAJJAR	40	8440`;

async function seed() {
    console.log("Waiting for firebase to init...");
    await new Promise(r => setTimeout(r, 2000));
    console.log("Firebase available?", isAvailable());

    const lines = rawData.split('\n').filter(l => l.trim().length > 0);

    for (const line of lines) {
        // e.g. VGTC-26/1985	3389938040	HR47G4337	NAHAR ROAD KOSALI	25	5500
        const parts = line.split('\t');
        if (parts.length < 6) continue;

        const lrRaw = parts[0].trim();
        const lrNo = parseInt(lrRaw.replace('VGTC-26/', ''), 10);
        const invNo = parts[1].trim();
        const truckNo = parts[2].trim();
        const dest = parts[3].trim();
        const qtyStr = parts[4].trim();
        const frtStr = parts[5].trim().replace('₹', '');

        const qty = parseFloat(qtyStr);
        const totalFrt = parseFloat(frtStr);
        const rate = parseFloat((totalFrt / qty).toFixed(2));

        console.log(`Inserting LR: ${lrNo}, Truck: ${truckNo}, Dest: ${dest}, Rate: ${rate}, Total: ${totalFrt}`);

        // 1. Manually add LR bypassing auto-increment to forcefully set lrNo
        // createLoadingReceipt auto increments, so we manually put it via firebase
        const lrData = {
            lrNo: lrNo,
            date: new Date().toISOString().split('T')[0],
            truckNo: truckNo,
            destination: dest,
            material: 'OPC FS',
            weight: qty,
            totalBags: qty * 20,
            billing: 'Yes',
            partyName: 'J K CEMENT WORKS',
            status: 'Loaded',
            createdAt: new Date().toISOString()
        };

        let lrId = "local-" + lrNo;
        if (isAvailable()) {
            const dbRef = db.collection('loading_receipts').doc();
            await dbRef.set(lrData);
            lrId = dbRef.id;
        } else {
            const localStore = require('./utils/localStore');
            const created = localStore.insert('loading_receipts', lrData);
            lrId = created.id;
        }

        // 2. Create Dump Voucher
        const voucherData = {
            type: 'Dump',
            date: new Date().toISOString().split('T')[0],
            truckNo: truckNo,
            lrNo: lrNo.toString(),
            customLrId: lrId, // link to LR
            route: dest,
            netWeight: qty,
            rate: rate,
            totalFreight: totalFrt,
            amount: totalFrt,
            advance: 0,
            dieselAmount: 0,
            balance: totalFrt,
            biltyCharges: 0,
            shortage: 0,
            tds: 0,
            paid: true,
            createdAt: new Date().toISOString()
        };

        try {
            await voucherService.createVoucher(voucherData);
            console.log(`-- Voucher created for LR ${lrNo}`);
        } catch (e) {
            console.log('-- Voucher error:', e.message);
        }
    }

    console.log("DONE SEEDING!");
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
