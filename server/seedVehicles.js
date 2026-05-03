/**
 * Seed script: Imports vehicle data from TOTAL VECHEL STATEMENT Excel
 * into Firestore 'vehicles' collection.
 * 
 * Usage: node seedVehicles.js
 */

const { db, admin, isAvailable } = require('./firebase');

// Helper: convert DD.MM.YYYY to YYYY-MM-DD
function parseDate(str) {
    if (!str || str === 'NILL' || str === 'nill' || str === '') return '';
    str = String(str).trim();
    // Handle DD.MM.YYYY
    const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotMatch) {
        const [, dd, mm, yyyy] = dotMatch;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    // Handle DD/MM/YYYY
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const [, dd, mm, yyyy] = slashMatch;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return '';
}

function normalizeTruckNo(val) {
    return String(val || '').toUpperCase().replace(/\s/g, '');
}

// Determine vehicle type based on weight
function guessVehicleType(grossWeight) {
    if (!grossWeight) return 'Trailer';
    if (grossWeight >= 45000) return 'Trailer';
    if (grossWeight >= 30000) return 'Trailer';
    if (grossWeight >= 15000) return 'Canter';
    return 'Canter';
}

// All vehicles from Excel
const vehiclesData = [
    // --- Market/Old Vehicles (SR.No 1-7, first group) ---
    { sr: 1, truckNo: 'HR47B4010', regDate: '20.06.2011', engineNo: 'B591803111E63136324', chassisNo: 'MAT466404B2E11800', grossWeight: 35000, unladenWeight: 11000, insurance: '11.06.2021', fitness: '16.06.2021', nationalPermit: '', permitLocal: '20.06.2022', tax: '31.06.2021', puc: '30.04.2021', ownershipType: 'market', bank: '' },
    { sr: 2, truckNo: 'HR63C7977', regDate: '01.01.2015', engineNo: '41L63409863', chassisNo: 'MAT447224E3N26631', grossWeight: 45500, unladenWeight: 12200, insurance: '28.12.2023', fitness: '05.01.2024', nationalPermit: '', permitLocal: '31.12.2024', tax: '31.03.2024', puc: '29.06.2023', ownershipType: 'market', bank: '' },
    { sr: 3, truckNo: 'HR63C8516', regDate: '28.03.2016', engineNo: '61B63497027', chassisNo: 'MAT447224GAB01999', grossWeight: 45500, unladenWeight: 12200, insurance: '26.09.2023', fitness: '02.04.2025', nationalPermit: '', permitLocal: '27.03.2026', tax: '30.09.2023', puc: '28.09.2023', ownershipType: 'market', bank: '' },
    { sr: 4, truckNo: 'HR69B7078', regDate: '08.09.2015', engineNo: 'B591803251G63455170', chassisNo: 'MAT447220F1G17557', grossWeight: 45500, unladenWeight: 12200, insurance: '30.08.2024', fitness: '13.09.2024', nationalPermit: '', permitLocal: '13.06.2025', tax: '31.12.2023', puc: '13.03.2024', ownershipType: 'market', bank: '' },
    { sr: 5, truckNo: 'HR36AB1512', regDate: '08.09.2017', engineNo: '3129792', chassisNo: 'D44637', grossWeight: 0, unladenWeight: 0, insurance: '27.08.2024', fitness: '07.09.2032', nationalPermit: '', permitLocal: '', tax: '', puc: '05.07.2023', ownershipType: 'market', bank: '' },
    { sr: 6, truckNo: 'HR36AD1352', regDate: '30.04.2018', engineNo: 'HA10AGJHD39144', chassisNo: 'MBLHAR374JHD29775', grossWeight: 0, unladenWeight: 0, insurance: '22.04.2024', fitness: '29.04.2033', nationalPermit: '', permitLocal: '', tax: '', puc: '06.08.2023', ownershipType: 'market', bank: '' },
    { sr: 7, truckNo: 'HR35Q2902', regDate: '25.03.2019', engineNo: 'HA10AGHB37451', chassisNo: 'MBLHAW084KHB19430', grossWeight: 0, unladenWeight: 0, insurance: '06.03.2024', fitness: '24.03.2024', nationalPermit: '', permitLocal: '', tax: '', puc: '13.04.2024', ownershipType: 'market', bank: '' },

    // --- Self Vehicles (SR.No 1-21, second group) ---
    { sr: 1, truckNo: 'HR63E9476', regDate: '03.12.2021', engineNo: 'E426CCMK364616', chassisNo: 'MC2ESHRCOMK196760', grossWeight: 18500, unladenWeight: 5450, insurance: '01.11.2023', fitness: '02.12.2023', nationalPermit: '', permitLocal: '19.01.2027', tax: '31.03.2026', puc: '23.03.2024', ownershipType: 'self', bank: '' },
    { sr: 2, truckNo: 'HR63E3841', regDate: '03.12.2021', engineNo: 'E426CCMK364607', chassisNo: 'MC2ESHRC0MK196758', grossWeight: 18500, unladenWeight: 5450, insurance: '01.11.2025', fitness: '03.12.2025', nationalPermit: '', permitLocal: '19.01.2027', tax: '31.03.2026', puc: '01.12.2025', ownershipType: 'self', bank: '' },
    { sr: 3, truckNo: 'HR63E8986', regDate: '15.03.2022', engineNo: 'NLPZ105250', chassisNo: 'MB1TZKHD0NPLR0658', grossWeight: 55000, unladenWeight: 13135, insurance: '23.02.2026', fitness: '01.03.2026', nationalPermit: '15.03.2025', permitLocal: '23.03.2027', tax: '30.09.2025', puc: '09.04.2026', ownershipType: 'self', bank: '' },
    { sr: 4, truckNo: 'HR47C0999', regDate: '28.09.2016', engineNo: '61C84288943', chassisNo: 'MAT466429GHC04183', grossWeight: 35000, unladenWeight: 11000, insurance: '23.09.2026', fitness: '28.09.2025', nationalPermit: '27.09.2025', permitLocal: '27.09.2025', tax: '31.03.2026', puc: '01.11.2025', ownershipType: 'self', bank: '' },
    { sr: 5, truckNo: 'HR63E9776', regDate: '02.02.2023', engineNo: '3.3LNGD05PXX536843', chassisNo: 'MAT843004N7P28898', grossWeight: 17750, unladenWeight: 5550, insurance: '16.01.2026', fitness: '01.02.2027', nationalPermit: '', permitLocal: '07.02.2028', tax: '31.03.2026', puc: '03.02.2026', ownershipType: 'self', bank: '' },
    { sr: 6, truckNo: 'HR63E3914', regDate: '13.10.2021', engineNo: 'E426CMH359080', chassisNo: 'MC2ESGRC0MH195302', grossWeight: 18500, unladenWeight: 5300, insurance: '26.09.2026', fitness: '12.10.2025', nationalPermit: '', permitLocal: '06.03.2027', tax: '31.03.2026', puc: '01.05.2026', ownershipType: 'self', bank: '' },
    { sr: 7, truckNo: 'HR63E9768', regDate: '22.07.2022', engineNo: 'NKPZ111041', chassisNo: 'MB1TZKHD4NPKR6914', grossWeight: 55000, unladenWeight: 12750, insurance: '04.07.2026', fitness: '12.07.2026', nationalPermit: '27.07.2026', permitLocal: '03.11.2027', tax: '31.03.2026', puc: '26.10.2027', ownershipType: 'self', bank: '' },
    { sr: 8, truckNo: 'HR63E1352', regDate: '16.11.2022', engineNo: 'NEPZ124020', chassisNo: 'MB1TZKHD7NPFS8599', grossWeight: 55000, unladenWeight: 13500, insurance: '12.10.2025', fitness: '06.11.2026', nationalPermit: '17.11.2026', permitLocal: '29.11.2027', tax: '31.03.2026', puc: '23.06.2026', ownershipType: 'self', bank: '' },
    { sr: 9, truckNo: 'HR63E9632', regDate: '02.02.2023', engineNo: 'NBPZ139012', chassisNo: 'MB1TZKHD2NPBU2379', grossWeight: 55000, unladenWeight: 13500, insurance: '10.01.2026', fitness: '23.01.2027', nationalPermit: '26.02.2026', permitLocal: '07.02.2028', tax: '31.03.2026', puc: '11.06.2026', ownershipType: 'self', bank: '' },
    { sr: 10, truckNo: 'HR47G6388', regDate: '08.11.2024', engineNo: '3.3LNGD11JVX520085', chassisNo: 'MAT843202RAJ14253', grossWeight: 18500, unladenWeight: 5430, insurance: '06.10.2025', fitness: '07.11.2026', nationalPermit: '', permitLocal: '19.12.2029', tax: '31.03.2026', puc: '07.11.2025', ownershipType: 'self', bank: 'HDB' },
    { sr: 11, truckNo: 'HR47G3246', regDate: '08.11.2024', engineNo: '3.3LNGD11JVX520084', chassisNo: 'MAT843202RAJ14254', grossWeight: 18500, unladenWeight: 5430, insurance: '06.10.2025', fitness: '07.11.2026', nationalPermit: '', permitLocal: '19.12.2029', tax: '31.03.2026', puc: '07.11.2025', ownershipType: 'self', bank: 'HDFC' },
    { sr: 12, truckNo: 'HR63F0904', regDate: '09.11.2023', engineNo: '3.3LNGD11KWX526916', chassisNo: 'MAT843202P7K21136', grossWeight: 18500, unladenWeight: 5430, insurance: '26.10.2025', fitness: '08.11.2025', nationalPermit: '', permitLocal: '14.11.2028', tax: '31.03.2026', puc: '23.01.2026', ownershipType: 'self', bank: '' },
    { sr: 13, truckNo: 'HR63F0751', regDate: '09.11.2023', engineNo: '3.3LNGD11KWX526721', chassisNo: 'MAT843202P7K20955', grossWeight: 18500, unladenWeight: 5430, insurance: '26.10.2025', fitness: '08.11.2025', nationalPermit: '', permitLocal: '14.11.2028', tax: '31.03.2026', puc: '08.11.2025', ownershipType: 'self', bank: '' },
    { sr: 14, truckNo: 'HR47F7819', regDate: '10.01.2024', engineNo: 'PGPZ127843', chassisNo: 'MB1T2VHD0PPGX5131', grossWeight: 55000, unladenWeight: 12740, insurance: '17.12.2025', fitness: '03.01.2026', nationalPermit: '24.02.2026', permitLocal: '24.02.2026', tax: '31.03.2026', puc: '01.05.2026', ownershipType: 'self', bank: '' },
    { sr: 15, truckNo: 'HR63D9020', regDate: '19.12.2018', engineNo: '81J84822616', chassisNo: 'MAT447264J5626108', grossWeight: 45500, unladenWeight: 12200, insurance: '11.12.2025', fitness: '13.12.2026', nationalPermit: '18.12.2025', permitLocal: '25.12.2028', tax: '31.03.2026', puc: '13.12.2025', ownershipType: 'self', bank: '' },
    { sr: 16, truckNo: 'HR47G1056', regDate: '13.06.2025', engineNo: '3.3LNGD11DUX508018', chassisNo: 'MAT843202S5D08076', grossWeight: 0, unladenWeight: 0, insurance: '23.05.2026', fitness: '12.06.2027', nationalPermit: '', permitLocal: '01.06.2030', tax: '31.03.2026', puc: '12.06.2026', ownershipType: 'self', bank: '' },
    { sr: 17, truckNo: 'HR47G0742', regDate: '17.06.2025', engineNo: '3.3LNGD11DUX510044', chassisNo: 'MAT843202S5E10061', grossWeight: 0, unladenWeight: 0, insurance: '23.05.2026', fitness: '16.06.2027', nationalPermit: '', permitLocal: '01.07.2030', tax: '31.03.2026', puc: '16.07.2026', ownershipType: 'self', bank: '' },
    { sr: 18, truckNo: 'HR47G0975', regDate: '17.06.2025', engineNo: '3.3LNGD11DUX510043', chassisNo: 'MAT843202S5E10060', grossWeight: 0, unladenWeight: 0, insurance: '23.05.2026', fitness: '16.06.2027', nationalPermit: '', permitLocal: '01.07.2030', tax: '31.03.2026', puc: '16.07.2026', ownershipType: 'self', bank: '' },
    { sr: 19, truckNo: 'HR47G0194', regDate: '17.07.2025', engineNo: 'SMPZ119327', chassisNo: 'MB1T2VHD3SPMF5502', grossWeight: 0, unladenWeight: 0, insurance: '28.05.2026', fitness: '18.06.2027', nationalPermit: '11.08.2026', permitLocal: '11.08.2030', tax: '31.03.2026', puc: '16.07.2026', ownershipType: 'self', bank: '' },
    { sr: 20, truckNo: 'HR47G3060', regDate: '17.07.2025', engineNo: 'SMPZ119615', chassisNo: 'MB1T2VHD9SPMF5505', grossWeight: 0, unladenWeight: 0, insurance: '28.05.2026', fitness: '18.06.2027', nationalPermit: '11.08.2026', permitLocal: '11.08.2030', tax: '31.03.2026', puc: '16.07.2026', ownershipType: 'self', bank: '' },
    { sr: 21, truckNo: 'HR47G4337', regDate: '17.07.2025', engineNo: 'SMPZ119424', chassisNo: 'MB1T2VHD4SPMF5377', grossWeight: 0, unladenWeight: 0, insurance: '28.05.2026', fitness: '18.06.2027', nationalPermit: '11.08.2026', permitLocal: '11.08.2030', tax: '31.03.2026', puc: '16.07.2026', ownershipType: 'self', bank: '' },
];

async function seedVehicles() {
    if (!isAvailable()) {
        console.error('❌ Firebase not available. Make sure serviceAccountKey.json exists.');
        process.exit(1);
    }

    console.log(`\n🚛 Starting vehicle seed: ${vehiclesData.length} vehicles to process...\n`);

    let created = 0, skipped = 0, errors = 0;

    for (const v of vehiclesData) {
        const truckNo = normalizeTruckNo(v.truckNo);

        // Check if already exists
        const snapshot = await db.collection('vehicles')
            .where('truckNo', '==', truckNo)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            console.log(`⏭  SKIP: ${truckNo} already exists (id: ${snapshot.docs[0].id})`);
            skipped++;
            continue;
        }

        const vehicleType = guessVehicleType(v.grossWeight);

        const payload = {
            truckNo,
            ownerName: v.ownershipType === 'self' ? 'Vikas Transport (Self)' : '',
            ownerContact: '',
            driverName: '',
            driverContact: '',
            vehicleType,
            ownershipType: v.ownershipType,
            make: 'Tata',
            model: '',
            grossWeight: v.grossWeight || 0,
            unladenWeight: v.unladenWeight || 0,
            regDate: parseDate(v.regDate),
            nationalPermitDate: parseDate(v.nationalPermit),
            rcDetails: JSON.stringify({
                engineNo: v.engineNo || '',
                chassisNo: v.chassisNo || '',
                fitnessNo: ''
            }),
            docNumbers: JSON.stringify({
                rcNo: '',
                insuranceNo: '',
                pollutionNo: '',
                permitNo: '',
                fitnessNo: '',
                taxNo: ''
            }),
            bankDetails: JSON.stringify({
                name: '',
                bank: v.bank || '',
                account: '',
                ifsc: ''
            }),
            gpsType: 'none',
            emiDetails: JSON.stringify({
                tenure: '', startDate: '', dueDate: '', loanNo: '',
                pending: '', total: '', due: '', interestRate: '',
                bankName: v.bank || '', paidEmis: []
            }),
            docs: JSON.stringify({
                rc: parseDate(v.regDate),       // RC expiry ~ reg date based
                pollution: parseDate(v.puc),
                permit: parseDate(v.permitLocal),
                insurance: parseDate(v.insurance),
                fitness: parseDate(v.fitness),
                tax: parseDate(v.tax)
            }),
            fastag: '',
            targetMileage: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        try {
            const ref = db.collection('vehicles').doc();
            await ref.set(payload);
            console.log(`✅ CREATED: ${truckNo} (${v.ownershipType}) → ${ref.id}`);
            created++;
        } catch (err) {
            console.error(`❌ ERROR: ${truckNo} → ${err.message}`);
            errors++;
        }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 SEED COMPLETE`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭  Skipped: ${skipped}`);
    console.log(`   ❌ Errors:  ${errors}`);
    console.log(`   📋 Total:   ${vehiclesData.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    process.exit(0);
}

seedVehicles().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
