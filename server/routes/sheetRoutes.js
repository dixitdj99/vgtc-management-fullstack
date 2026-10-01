const express = require('express');
const router = express.Router();
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { permits } = require('../middleware/auth');
const { getCol } = require('../utils/collectionUtils');
const voucherService = require('../services/voucherService');
const stockService = require('../utils/stockService');
const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { logAction, ACTIONS } = require('../services/auditService');

router.use(tenancyMiddleware);

const BALANCE_COLUMNS = [
    { id: 'date', title: 'Date', type: 'date', width: 110, editable: true },
    { id: 'plant', title: 'Plant', width: 110, editable: true, options: ['Kosli', 'Jhajjar', 'Bahadurgarh', 'JK Super', 'JKL Dump', 'JK Lakshmi'] },
    { id: 'voucherNo', title: 'Voucher #', width: 120, editable: true },
    { id: 'lrNo', title: 'LR No.', width: 110, editable: true },
    { id: 'truckNo', title: 'Truck No.', width: 130, editable: true },
    { id: 'driverName', title: 'Driver', width: 160, editable: true },
    { id: 'ownerName', title: 'Owner', width: 170, editable: true },
    { id: 'billNo', title: 'Bill No.', width: 110, editable: true },
    { id: 'partyCode', title: 'Party Code', width: 110, editable: true },
    { id: 'partyName', title: 'Party Name', width: 180, editable: true },
    { id: 'destination', title: 'Destination', width: 170, editable: true },
    { id: 'weight', title: 'Weight (MT)', type: 'number', width: 110, editable: true },
    { id: 'rate', title: 'Rate (₹)', type: 'number', width: 100, editable: true },
    { id: 'grossFreight', title: 'Gross (₹)', type: 'number', width: 120, editable: false },
    { id: 'advanceDiesel', title: 'Diesel (₹)', width: 110, editable: true },
    { id: 'advanceCash', title: 'Cash (₹)', type: 'number', width: 100, editable: true },
    { id: 'advanceOnline', title: 'Online (₹)', type: 'number', width: 100, editable: true },
    { id: 'munshi', title: 'Munshi (₹)', type: 'number', width: 100, editable: true },
    { id: 'shortage', title: 'Shortage (₹)', type: 'number', width: 100, editable: true },
    { id: 'commission', title: 'Commission (₹)', type: 'number', width: 110, editable: true },
    { id: 'tyrePuncture', title: 'Tyre Puncture (₹)', type: 'number', width: 120, editable: true },
    { id: 'tyreGreasingAir', title: 'Veh Exp (₹)', type: 'number', width: 110, editable: true },
    { id: 'netBalance', title: 'Net Bal (₹)', type: 'number', width: 120, editable: false },
    { id: 'paidBalance', title: 'Paid (₹)', type: 'number', width: 110, editable: true },
    { id: 'paymentClearedDate', title: 'Cleared Date', type: 'date', width: 120, editable: true },
    { id: 'paymentStatus', title: 'Status', width: 130, editable: true, options: ['Pending', 'Sent to Pay', 'Paid'] },
    { id: 'remark', title: 'Remark', width: 220, editable: true },
];

const CHALLAN_COLUMNS = [
    { id: 'challanNo', title: 'Challan #', width: 130, editable: true },
    { id: 'date', title: 'Date', type: 'date', width: 120, editable: true },
    { id: 'truckNo', title: 'Truck', width: 135, editable: true },
    { id: 'materialSummary', title: 'Materials', width: 230, editable: false },
    { id: 'totalBags', title: 'Total Bags', type: 'number', width: 110, editable: true },
    { id: 'loadedBags', title: 'Loaded Bags', type: 'number', width: 115, editable: false },
    { id: 'partyName', title: 'Party', width: 190, editable: true },
    { id: 'partyCode', title: 'Party Code', width: 120, editable: true },
    { id: 'billNo', title: 'Bill No.', width: 120, editable: true },
    { id: 'destination', title: 'Destination', width: 180, editable: true },
    { id: 'factoryCode', title: 'Factory', width: 110, editable: true },
    { id: 'status', title: 'Status', width: 145, editable: true, options: ['open', 'partially_loaded', 'loaded', 'cancelled'] },
    { id: 'remark', title: 'Remark', width: 220, editable: true },
];
const JKL_CHALLAN_COLUMNS = CHALLAN_COLUMNS
    .filter(column => !['partyCode', 'billNo'].includes(column.id))
    .map(column => column.id === 'loadedBags' ? { ...column, editable: true } : column);

const DEFINITIONS = {
    'balance-all': { kind: 'balance', title: 'All Balance Sheet', permission: 'balance_all', type: 'all' },
    'balance-kosli': { kind: 'balance', title: 'Kosli Balance Sheet', permission: 'balance_kosli', type: 'Kosli_Bill' },
    'balance-jhajjar': { kind: 'balance', title: 'Jhajjar Balance Sheet', permission: 'balance_jhajjar', type: 'Jajjhar_Bill' },
    'balance-bahadurgarh': { kind: 'balance', title: 'Bahadurgarh Balance Sheet', permission: 'balance_bahadurgarh', type: 'Bahadurgarh_Bill' },
    'balance-jksuper': { kind: 'balance', title: 'JK Super Balance Sheet', permission: 'balance_jksuper', type: 'JK_Super' },
    'balance-jkl-dump': { kind: 'balance', title: 'JK Lakshmi Dump Balance Sheet', permission: 'balance_jkl_dump', type: 'Dump' },
    'balance-jkl': { kind: 'balance', title: 'JK Lakshmi Balance Sheet', permission: 'balance_jkl', type: 'JK_Lakshmi' },
    'challans-kosli': { kind: 'challan', title: 'Kosli Challans', permission: 'stock_kosli', collection: 'kosli_challans' },
    'challans-jhajjar': { kind: 'challan', title: 'Jhajjar Challans', permission: 'stock_jhajjar', collection: 'jhajjar_challans' },
    'challans-bahadurgarh': { kind: 'challan', title: 'Bahadurgarh Challans', permission: 'stock_bahadurgarh', collection: 'bahadurgarh_challans' },
    'challans-jkl': { kind: 'challan', title: 'JK Lakshmi Challans', permission: 'stock_jkl', collection: 'jkl_challans' },
};

const columnsFor = definition => definition.kind === 'balance'
    ? BALANCE_COLUMNS
    : definition.collection === 'jkl_challans' ? JKL_CHALLAN_COLUMNS : CHALLAN_COLUMNS;

const TYPE_NAME_MAP = {
    Kosli_Bill: 'Kosli',
    Jajjhar_Bill: 'Jhajjar',
    Bahadurgarh_Bill: 'Bahadurgarh',
    JK_Super: 'JK Super',
    Dump: 'JKL Dump',
    JK_Lakshmi: 'JK Lakshmi',
};

const REVERSE_TYPE_MAP = {
    'Kosli': 'Kosli_Bill',
    'Jhajjar': 'Jajjhar_Bill',
    'Bahadurgarh': 'Bahadurgarh_Bill',
    'JK Super': 'JK_Super',
    'JKL Dump': 'Dump',
    'JK Lakshmi': 'JK_Lakshmi',
};

const asNumber = value => Number.parseFloat(value) || 0;
const timestamp = value => value?.toDate?.().toISOString?.() || value || null;
const revisionOf = row => timestamp(row.updatedAt) || timestamp(row.createdAt) || 'legacy';

function balanceRow(row) {
    const gross = Array.isArray(row.deliveries) && row.deliveries.length
        ? row.deliveries.reduce((sum, d) => sum + asNumber(d.weight) * asNumber(d.rate), 0)
        : asNumber(row.weight) * asNumber(row.rate);
    const munshi = asNumber(row.munshi);
    const commission = asNumber(row.commission);
    const shortage = asNumber(row.shortage);
    const tyrePuncture = asNumber(row.tyrePuncture);
    const tyreGreasingAir = asNumber(row.tyreGreasingAir) || (asNumber(row.tyreGreasing) + asNumber(row.tyreAir));
    const extraCash = asNumber(row.extraCash);
    const diesel = row.advanceDiesel === 'FULL' ? 4000 : asNumber(row.advanceDiesel);
    const net = gross - diesel - asNumber(row.advanceCash) - asNumber(row.advanceOnline) - munshi - commission - shortage - tyrePuncture - tyreGreasingAir - extraCash;
    const paid = asNumber(row.paidBalance);
    const outstanding = Math.max(0, net - paid);
    const isCleared = !!row.paymentClearedDate || !!row.isPaid || (paid > 0 && outstanding <= 0);
    const paymentStatus = isCleared ? 'Paid' : (row.status || (outstanding <= 0 ? 'Paid' : 'Pending'));

    return {
        ...row,
        voucherNo: row.voucherNo || row.entryId || '',
        plant: TYPE_NAME_MAP[row.type] || row.plant || row.type || '',
        grossFreight: Math.round(gross),
        netBalance: Math.round(net),
        paymentStatus,
        _revision: revisionOf(row)
    };
}

function challanRow(row) {
    const materials = Array.isArray(row.materials) ? row.materials : [];
    return {
        ...row,
        materialSummary: materials.map(m => `${m.type}: ${m.totalBags || 0}`).join(', '),
        totalBags: materials.reduce((sum, m) => sum + asNumber(m.totalBags), 0),
        loadedBags: materials.reduce((sum, m) => sum + asNumber(m.loadedBags), 0),
        _revision: revisionOf(row),
    };
}

function challanPatch(before, field, value) {
    if (field !== 'totalBags') return { [field]: value };
    const materials = before.materials || [];
    if (materials.length !== 1) {
        throw new Error('Edit bag quantities in the Challan form when a challan has multiple materials');
    }
    if (!Number.isInteger(value) || value <= 0) throw new Error('Total Bags must be a positive whole number');
    if (value < asNumber(materials[0].loadedBags)) throw new Error('Total Bags cannot be less than Loaded Bags');
    return { materials: [{ ...materials[0], totalBags: value }] };
}

function conflictFor(row) {
    const error = new Error('Row changed in another window. Review latest values and retry.');
    error.status = 409;
    error.row = challanRow(row);
    return error;
}

async function saveChallanEdit(collection, before, field, value, revision) {
    const apply = latest => {
        if (!latest || latest.orgId !== before.orgId) {
            const error = new Error('Row not found');
            error.status = 404;
            throw error;
        }
        if (revision && revision !== revisionOf(latest)) throw conflictFor(latest);
        const updates = challanPatch(latest, field, value);
        if (field === 'truckNo') updates.truckNo = value.toUpperCase().replace(/\s/g, '');
        if (field === 'factoryCode') updates.factoryCode = value.toUpperCase();
        updates.updatedAt = new Date().toISOString();
        return updates;
    };
    if (isAvailable()) {
        const ref = db.collection(collection).doc(before.id);
        return db.runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            const latest = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
            const updates = apply(latest);
            transaction.update(ref, updates);
            return { ...latest, ...updates };
        });
    }
    const latest = localStore.getById(collection, before.id);
    const updates = apply(latest);
    return localStore.update(collection, before.id, updates);
}

function definitionFor(req, action = 'view') {
    const definition = DEFINITIONS[req.params.sheetId];
    if (!definition) return { error: [404, 'Unknown sheet'] };
    if (req.params.sheetId === 'balance-all') {
        const canAccess = req.user?.role === 'admin' || permits(req.user, 'balance_all', action);
        if (!canAccess) return { error: [403, `${action} permission required for balance_all`] };
        return { definition };
    }
    if (!permits(req.user, definition.permission, action)) return { error: [403, `${action} permission required for ${definition.permission}`] };
    return { definition };
}

router.get('/:sheetId', async (req, res) => {
    const { definition, error } = definitionFor(req);
    if (error) return res.status(error[0]).json({ error: error[1] });
    try {
        let raw;
        if (definition.kind === 'balance') {
            const col = getCol('vouchers', req);
            if (definition.type === 'all') {
                raw = await voucherService.getAllVouchers(req.orgId, col);
                if (req.user?.role !== 'admin') {
                    const TYPE_PERM_MAP = {
                        Kosli_Bill: 'balance_kosli',
                        Jajjhar_Bill: 'balance_jhajjar',
                        Bahadurgarh_Bill: 'balance_bahadurgarh',
                        JK_Super: 'balance_jksuper',
                        Dump: 'balance_jkl_dump',
                        JK_Lakshmi: 'balance_jkl',
                    };
                    raw = (raw || []).filter(v => permits(req.user, TYPE_PERM_MAP[v.type], 'view'));
                }
            } else {
                raw = await voucherService.getVouchersByType(req.orgId, definition.type, col);
            }
        } else {
            raw = await stockService.getAllChallans(req.orgId, getCol(definition.collection, req));
        }
        const rows = (raw || []).map(definition.kind === 'balance' ? balanceRow : challanRow);
        rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        res.json({
            id: req.params.sheetId,
            title: definition.title,
            canEdit: req.user?.role === 'admin' || permits(req.user, definition.permission, 'edit'),
            columns: columnsFor(definition),
            rows,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:sheetId', async (req, res) => {
    const { definition, error } = definitionFor(req, 'edit');
    if (error) return res.status(error[0]).json({ error: error[1] });
    try {
        const body = req.body || {};
        if (definition.kind === 'balance') {
            return res.status(403).json({ error: 'Adding rows to Balance Sheets is disabled. Add new entries via vouchers.' });
        } else {
            const col = getCol(definition.collection, req);
            const newChallan = {
                orgId: req.orgId,
                challanNo: body.challanNo || `CH-${Date.now().toString().slice(-6)}`,
                date: body.date || new Date().toISOString().split('T')[0],
                truckNo: (body.truckNo || '').toUpperCase().trim(),
                partyName: (body.partyName || '').trim(),
                destination: (body.destination || '').trim(),
                factoryCode: (body.factoryCode || '').trim(),
                status: body.status || 'open',
                remark: (body.remark || '').trim(),
                materials: body.materials || [],
                createdAt: new Date().toISOString(),
            };
            const created = await stockService.createChallan(req.orgId, newChallan, col);
            const formatted = challanRow({ ...newChallan, id: created.id || created });
            await logAction({
                orgId: req.orgId,
                action: ACTIONS.SPREADSHEET_CELL_UPDATED,
                performedBy: req.user.id,
                performedByName: req.user.name,
                targetId: created.id || created,
                targetType: req.params.sheetId,
                after: formatted,
                metadata: { source: 'spreadsheet', action: 'challan_row_created' },
            });
            res.status(201).json({ row: formatted });
        }
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.patch('/:sheetId/:id', async (req, res) => {
    const { definition, error } = definitionFor(req, 'edit');
    if (error) return res.status(error[0]).json({ error: error[1] });
    const columns = columnsFor(definition);
    const column = columns.find(item => item.id === req.body.field);
    if (!column || column.editable === false) return res.status(400).json({ error: 'Field is read-only' });
    try {
        const collection = getCol(definition.kind === 'balance' ? 'vouchers' : definition.collection, req);
        const rows = definition.kind === 'balance'
            ? (definition.type === 'all'
                ? await voucherService.getAllVouchers(req.orgId, collection)
                : await voucherService.getVouchersByType(req.orgId, definition.type, collection))
            : await stockService.getAllChallans(req.orgId, collection);
        const before = rows.find(row => row.id === req.params.id);
        if (!before) return res.status(404).json({ error: 'Row not found' });
        if (req.body.revision && req.body.revision !== revisionOf(before)) {
            return res.status(409).json({ error: 'Row changed in another window', row: definition.kind === 'balance' ? balanceRow(before) : challanRow(before) });
        }

        let value = req.body.value;
        if (column.type === 'number') {
            if (value === '' || value === null || value === undefined) {
                value = '';
            } else {
                value = Number(value);
                if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'Enter a valid non-negative number' });
            }
        } else if (column.type === 'date') {
            value = String(value ?? '').trim();
            if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return res.status(400).json({ error: 'Use YYYY-MM-DD date' });
        } else {
            value = String(value ?? '').trim();
            if (column.options && value && !column.options.includes(value)) {
                const matched = column.options.find(opt => opt.toLowerCase() === value.toLowerCase());
                if (matched) value = matched;
                else return res.status(400).json({ error: `Choose one of: ${column.options.join(', ')}` });
            }
        }

        if (definition.kind === 'balance') {
            const updates = { [column.id]: value };
            if (column.id === 'truckNo') updates.truckNo = value.toUpperCase();
            if (column.id === 'voucherNo') updates.entryId = value;
            if (column.id === 'weight' || column.id === 'rate') {
                const w = column.id === 'weight' ? asNumber(value) : asNumber(before.weight);
                const r = column.id === 'rate' ? asNumber(value) : asNumber(before.rate);
                updates.total = String(Math.round(w * r));
            }
            if (column.id === 'paymentStatus') {
                updates.status = value;
                if (value === 'Paid' && !before.paidBalance) {
                    const gross = asNumber(before.weight) * asNumber(before.rate);
                    const net = gross - asNumber(before.advanceDiesel) - asNumber(before.advanceCash) - asNumber(before.advanceOnline);
                    updates.paidBalance = String(Math.max(0, net));
                    updates.paymentClearedDate = new Date().toISOString().split('T')[0];
                }
            }
            if (column.id === 'plant') {
                if (REVERSE_TYPE_MAP[value]) updates.type = REVERSE_TYPE_MAP[value];
            }
            await voucherService.updateVoucher(before.id, updates, collection);
        } else {
            if (definition.collection === 'jkl_challans') {
                if (column.id === 'status') await stockService.updateChallanStatus(before.id, value, collection);
                else await stockService.updateChallan(before.id, { [column.id]: value }, collection);
            } else {
                await saveChallanEdit(collection, before, column.id, value, req.body.revision);
            }
        }

        const afterRows = definition.kind === 'balance'
            ? (definition.type === 'all'
                ? await voucherService.getAllVouchers(req.orgId, collection)
                : await voucherService.getVouchersByType(req.orgId, definition.type, collection))
            : await stockService.getAllChallans(req.orgId, collection);
        const after = afterRows.find(row => row.id === before.id);
        await logAction({
            orgId: req.orgId,
            action: ACTIONS.SPREADSHEET_CELL_UPDATED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: before.id,
            targetType: req.params.sheetId,
            before: { [column.id]: (definition.kind === 'challan' ? challanRow(before) : balanceRow(before))[column.id] },
            after: { [column.id]: (definition.kind === 'challan' ? challanRow(after || before) : balanceRow(after || before))[column.id] },
            metadata: { source: 'spreadsheet', field: column.id },
        });
        res.json({ row: definition.kind === 'balance' ? balanceRow(after || { ...before, [column.id]: value }) : challanRow(after || { ...before, [column.id]: value }) });
    } catch (e) {
        res.status(e.status || 400).json({ error: e.message, ...(e.row ? { row: e.row } : {}) });
    }
});

router.delete('/:sheetId/:id', async (req, res) => {
    return res.status(403).json({ error: 'Deleting rows is disabled. You can only edit entries.' });
});

module.exports = router;
module.exports.DEFINITIONS = DEFINITIONS;
module.exports.BALANCE_COLUMNS = BALANCE_COLUMNS;
module.exports.CHALLAN_COLUMNS = CHALLAN_COLUMNS;
module.exports.challanPatch = challanPatch;
module.exports.columnsFor = columnsFor;
