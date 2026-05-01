const { google } = require('googleapis');
const driveService = require('./driveService');
const { db, admin, isAvailable } = require('../firebase');

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY / COLUMNS 
// ─────────────────────────────────────────────────────────────────────────────

const SPREADSHEETS = {
    balance: {
        folder: 'Balance_Sheet',
        tabs: {
            'JK_Super': 'JK Super Factory',
            'Dump': 'JK Super Dump',
            'Kosli_Bill': 'Kosli Bill',
            'Jajjhar_Bill': 'Jajjhar Bill',
            'JK_Lakshmi': 'JK Lakshmi Factory', // Fallback, only created for jklakshmi brand
        },
        headers: {
            default: [
                'LR No.', 'Date', 'Truck No.', 'Destination',
                'Weight (MT)', 'Rate (Rs/MT)', 'Gross Total (Rs)',
                'Diesel Advance', 'Cash Advance', 'Online Advance',
                'Munshi', 'Shortage', 'Commission',
                'Net Balance (Rs)', 'Paid Balance (Rs)', 'Outstanding (Rs)',
                'Payment Status', 'Payment Cleared Date',
                'Pump', 'Bags', 'Diesel Verified', 'Created At',
                'Voucher ID'
            ]
        },
        idColIndex: 23, // W
        idColLetter: 'W:W'
    },
    stock: {
        folder: 'Dump_Stock',
        tabs: {
            migo: 'MIGO Arrivals',
            challans: 'Challans',
            history: 'Stock History'
        },
        headers: {
            migo: ['Date', 'Truck #', 'Material', 'Quantity', 'Remark', 'Created By', 'Entry ID'],
            challans: ['Challan #', 'Date', 'Truck', 'Material', 'Qty (bags)', 'Party', 'Remark', 'Status', 'Created By', 'Entry ID'],
            history: ['Date', 'Type', 'Reference/Details', 'Truck', 'Material', 'In (bags)', 'Out (bags)', 'Entry ID']
        },
        idColKeys: {
            migo: { index: 7, letter: 'G:G' },
            challans: { index: 10, letter: 'J:J' },
            history: { index: 8, letter: 'H:H' }
        }
    },
    cashbook: {
        folder: 'Cashbook',
        tabs: {
            ledger: 'Full Ledger',
            deposits: 'Manual Deposits',
            cash_outs: 'Manual Cash Outs',
            online: 'Online Advances'
        },
        headers: {
            ledger: ['Date', 'Description', 'Type', 'Credit (In)', 'Debit (Out)', 'Balance', 'Created By', 'Entry ID'],
            deposits: ['Date', 'Description', 'Credit (In)', 'Debit (Out)', 'Created By', 'Entry ID'],
            cash_outs: ['Date', 'Description', 'Credit (In)', 'Debit (Out)', 'Created By', 'Entry ID'],
            online: ['Date', 'Truck', 'LR No.', 'Type', 'Amount', 'Paid Date', 'Status', 'Entry ID']
        },
        idColKeys: {
            ledger: { index: 8, letter: 'H:H' },
            deposits: { index: 6, letter: 'F:F' },
            cash_outs: { index: 6, letter: 'F:F' },
            online: { index: 8, letter: 'H:H' }
        }
    },
    pay_vehicles: {
        folder: 'Pay_Vehicles',
        tabs: {
            pending: 'Pending Overview',
            cleared: 'Cleared History'
        },
        headers: {
            pending: ['Truck No.', 'Trip Types', 'Pending Trips', 'Outstanding Due', 'Diesel Status'],
            cleared: ['Cleared Date', 'LR Date', 'LR No.', 'Trip Type', 'Destination', 'Total Bill', 'Amount Paid', 'Voucher ID']
        },
        idColKeys: {
            pending: { index: 1, letter: 'A:A' }, // Truck No is unique key here
            cleared: { index: 8, letter: 'H:H' }
        }
    }
};

const BRANDS = {
    jksuper: { label: 'JK_Super', prefix: 'JK_Super_' },
    jklakshmi: { label: 'JK_Lakshmi', prefix: 'JK_Lakshmi_' }
};

async function getSheetsClient() {
    const auth = await driveService.getAuthClient();
    return google.sheets({ version: 'v4', auth });
}

// ─────────────────────────────────────────────────────────────────────────────
// SPREADSHEET BUILDER
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateSpreadsheet(moduleKey, brand = 'jksuper') {
    const config = SPREADSHEETS[moduleKey];
    const bConfig = BRANDS[brand];
    const docName = `sheets_id_${moduleKey}_${brand}`;

    if (isAvailable()) {
        try {
            const doc = await db.collection('system_config').doc(docName).get();
            if (doc.exists && doc.data().spreadsheetId) {
                const cachedId = doc.data().spreadsheetId;
                try {
                    const sheets = await getSheetsClient();
                    await sheets.spreadsheets.get({ spreadsheetId: cachedId, fields: 'spreadsheetId' });
                    return cachedId;
                } catch (e) {
                    console.warn(`[Sheets] Cached ${docName} not found, recreating...`);
                }
            }
        } catch (e) {}
    }

    // Compose Tabs based on brand (specifically for Balance Sheet, filter out wrong brands)
    let myTabs = Object.entries(config.tabs);
    if (moduleKey === 'balance') {
        if (brand === 'jksuper') myTabs = myTabs.filter(([k]) => k === 'JK_Super' || k === 'Dump' || k === 'Kosli_Bill' || k === 'Jajjhar_Bill');
        if (brand === 'jklakshmi') myTabs = myTabs.filter(([k]) => k === 'JK_Lakshmi' || k === 'Dump');
    }

    const title = bConfig.prefix + config.folder;

    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.create({
        resource: {
            properties: { title },
            sheets: myTabs.map(([k, t]) => ({ properties: { title: t } })),
        },
    });
    const spreadsheetId = res.data.spreadsheetId;

    const requests = [];
    for (const [key, tabName] of myTabs) {
        const headers = config.headers[key] || config.headers.default;
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${tabName}'!A1`,
            valueInputOption: 'RAW',
            resource: { values: [headers] },
        });
    }

    res.data.sheets.forEach(s => {
        requests.push({
            updateSheetProperties: {
                properties: { sheetId: s.properties.sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
            },
        });
    });
    
    if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
    }

    try {
        const auth = await driveService.getAuthClient();
        const drive = google.drive({ version: 'v3', auth });
        
        const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
        const plantFolderId = await driveService.getOrCreateFolder(bConfig.label, rootId);
        const targetFolderId = await driveService.getOrCreateFolder(config.folder, plantFolderId);

        const file = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
        const previousParents = file.data.parents ? file.data.parents.join(',') : '';
        
        await drive.files.update({
            fileId: spreadsheetId,
            addParents: targetFolderId,
            removeParents: previousParents,
            fields: 'id, parents'
        });
        console.log(`[Sheets] Moved ${title} to ${config.folder} folder.`);
    } catch (err) {
        console.error(`[Sheets] Failed to move ${title}:`, err.message);
    }

    if (isAvailable()) {
        await db.collection('system_config').doc(docName).set({
            spreadsheetId, createdAt: new Date().toISOString(),
        });
    }

    return spreadsheetId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC UPSERT AND DELETE
// ─────────────────────────────────────────────────────────────────────────────

async function upsertRow(moduleKey, tabKey, brand, rowId, rowData) {
    try {
        const config = SPREADSHEETS[moduleKey];
        const spreadsheetId = await getOrCreateSpreadsheet(moduleKey, brand);
        const sheets = await getSheetsClient();
        const sheetName = config.tabs[tabKey];
        
        let idLetter = config.idColLetter;
        if (config.idColKeys && config.idColKeys[tabKey]) {
            idLetter = config.idColKeys[tabKey].letter;
        }

        const searchRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!${idLetter}`,
        });
        
        const colValues = searchRes.data.values || [];
        let targetRow = -1;
        for (let i = 1; i < colValues.length; i++) {
            if (colValues[i][0] === String(rowId)) {
                targetRow = i + 1;
                break;
            }
        }

        if (targetRow > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A${targetRow}`,
                valueInputOption: 'RAW',
                resource: { values: [rowData] },
            });
            console.log(`[Sheets] Updated row ${targetRow} in ${moduleKey}/${sheetName}`);
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `'${sheetName}'!A1`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [rowData] },
            });
            console.log(`[Sheets] Appended new row in ${moduleKey}/${sheetName}`);
        }
    } catch (e) {
        console.error(`[Sheets] upsertRow failed for ${moduleKey}/${tabKey}:`, e.message);
    }
}

async function deleteRow(moduleKey, tabKey, brand, rowId) {
    try {
        const config = SPREADSHEETS[moduleKey];
        const spreadsheetId = await getOrCreateSpreadsheet(moduleKey, brand);
        const sheets = await getSheetsClient();
        const sheetName = config.tabs[tabKey];
        
        let idLetter = config.idColLetter;
        if (config.idColKeys && config.idColKeys[tabKey]) {
            idLetter = config.idColKeys[tabKey].letter;
        }

        const searchRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!${idLetter}`,
        });
        
        const colValues = searchRes.data.values || [];
        let targetRow = -1;
        for (let i = 1; i < colValues.length; i++) {
            if (colValues[i][0] === String(rowId)) {
                targetRow = i + 1;
                break;
            }
        }
        if (targetRow <= 0) return;

        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
        const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheetMeta) return;

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetMeta.properties.sheetId,
                            dimension: 'ROWS',
                            startIndex: targetRow - 1,
                            endIndex: targetRow,
                        },
                    },
                }],
            },
        });
        console.log(`[Sheets] Deleted row for ${rowId} in ${moduleKey}/${sheetName}`);
    } catch (e) {
        console.error(`[Sheets] deleteRow failed for ${moduleKey}:`, e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE SHEET (VOUCHERS)
// ─────────────────────────────────────────────────────────────────────────────

function voucherToRow(v) {
    const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
    const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
    const diesel = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
    const cash = parseFloat(v.advanceCash) || 0;
    const online = parseFloat(v.advanceOnline) || 0;
    const munshi = parseFloat(v.munshi) || 0;
    const shortage = parseFloat(v.shortage) || 0;
    const commission = parseFloat(v.commission) || 0;
    const net = gross - (diesel + cash + online + munshi + shortage + commission);
    const paid = parseFloat(v.paidBalance) || 0;
    const outstanding = Math.max(0, net - paid);

    let createdAtStr = '';
    if (v.createdAt) {
        const d = v.createdAt.seconds ? new Date(v.createdAt.seconds * 1000) : new Date(v.createdAt);
        createdAtStr = d.toLocaleDateString('en-IN');
    }

    return [
        v.lrNo || '', v.date || '', v.truckNo || '', v.destination || '',
        v.weight || '', v.rate || '', Math.round(gross),
        dieselPending ? 'FULL (Pending)' : (v.advanceDiesel || ''),
        v.advanceCash || '', v.advanceOnline || '', v.munshi || '', v.shortage || '', v.commission || '',
        Math.round(net), Math.round(paid), Math.round(outstanding),
        outstanding <= 0 ? 'Cleared' : 'Pending', v.paymentClearedDate || '',
        v.pump || '', v.bags || '', v.isDieselVerified ? 'Yes' : 'No', createdAtStr, v.id || '',
    ];
}

async function upsertVoucherRow(voucher, voucherType, brand = 'jksuper') {
    return upsertRow('balance', voucherType, brand, voucher.id, voucherToRow(voucher));
}

async function deleteVoucherRow(voucherId, voucherType, brand = 'jksuper') {
    return deleteRow('balance', voucherType, brand, voucherId);
}

// ─────────────────────────────────────────────────────────────────────────────
// DUMP STOCK
// ─────────────────────────────────────────────────────────────────────────────

const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN') : '';

function stockMigoToRow(m) {
    return [fmtD(m.date), m.truckNo || '', m.material || '', m.quantity || '', m.remark || '', m.createdBy || '', m.id || ''];
}

function stockChallanToRow(c) {
    let mats = '';
    if (c.materials) {
        mats = c.materials.map(x => x.type).join(', ');
    } else {
        mats = c.material || '';
    }
    
    let qtys = '';
    if (c.materials) {
        qtys = c.materials.map(x => x.totalBags).join(', ');
    } else {
        qtys = String(c.quantity || '');
    }

    return [c.challanNo || '', fmtD(c.date), c.truckNo || '', mats, qtys, c.partyName || '', c.remark || '', c.status || 'open', c.createdBy || '', c.id || ''];
}

async function upsertStockMigo(migo, brand) {
    return upsertRow('stock', 'migo', brand, migo.id, stockMigoToRow(migo));
}

async function deleteStockMigo(id, brand) {
    return deleteRow('stock', 'migo', brand, id);
}

async function upsertStockChallan(challan, brand) {
    return upsertRow('stock', 'challans', brand, challan.id, stockChallanToRow(challan));
}

async function deleteStockChallan(id, brand) {
    return deleteRow('stock', 'challans', brand, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// CASHBOOK 
// ─────────────────────────────────────────────────────────────────────────────

function cbToRow(cb) {
    const isDeposit = cb.type === 'deposit';
    return [fmtD(cb.date), cb.remark || '', isDeposit ? cb.amount : '', !isDeposit ? cb.amount : '', cb.createdBy || '', cb.id || ''];
}

async function upsertCashbook(cb, brand) {
    const tabKey = cb.type === 'deposit' ? 'deposits' : 'cash_outs';
    return upsertRow('cashbook', tabKey, brand, cb.id, cbToRow(cb));
}

async function deleteCashbook(id, type, brand) {
    const tabKey = type === 'deposit' ? 'deposits' : 'cash_outs';
    return deleteRow('cashbook', tabKey, brand, id);
}

// (For Full Ledger: Because it requires running Balance calculations, we sync it globally on bulk demand if needed, 
//  but manual entries will upsert directly to Deposits/CashOuts tabs first to maintain speed).

// ─────────────────────────────────────────────────────────────────────────────
// PAY VEHICLES (Sync triggered alongside Vouchers)
// ─────────────────────────────────────────────────────────────────────────────

function payHistoryToRow(v) {
    const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
    const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
    const cash = parseFloat(v.advanceCash) || 0;
    const online = parseFloat(v.advanceOnline) || 0;
    const short = (parseFloat(v.munshi) || 0) + (parseFloat(v.shortage) || 0) + (parseFloat(v.commission) || 0);
    const net = gross - diesel - cash - online - short;
    
    return [fmtD(v.paymentClearedDate), fmtD(v.date), v.lrNo || '', v.type || '', v.destination || '', Math.round(net), v.paidBalance || '', v.id || ''];
}

async function upsertPayHistory(voucher, brand) {
    if ((parseFloat(voucher.paidBalance) || 0) > 0) {
        return upsertRow('pay_vehicles', 'cleared', brand, voucher.id, payHistoryToRow(voucher));
    }
}

async function deletePayHistory(voucherId, brand) {
    return deleteRow('pay_vehicles', 'cleared', brand, voucherId);
}


/* Export all generic service functions */
module.exports = { 
    getOrCreateSpreadsheet,
    upsertVoucherRow, deleteVoucherRow,
    upsertStockMigo, deleteStockMigo,
    upsertStockChallan, deleteStockChallan,
    upsertCashbook, deleteCashbook,
    upsertPayHistory, deletePayHistory
};
