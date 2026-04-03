const fs = require('fs');
const path = require('path');
const pdfService = require('./pdfService');
const driveService = require('./driveService');

// Data Services
const sellService = require('./sellService');
const voucherService = require('../services/voucherService');
const cashbookService = require('./cashbookService');
const lrService = require('../services/lrService');

const TEMP_DIR = path.join(__dirname, '..', 'temp_backups');

const PLANTS = {
    SUPER: 'JK_Super',
    LAKSHMI: 'JK_Lakshmi',
    DUMP: 'Dump'
};

/**
 * Orchestrates the weekly backup process.
 */
async function runWeeklyBackup() {
    console.log('[Backup] Starting weekly backup...');
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    try {
        const rootFolderId = await driveService.getOrCreateFolder('VGTC_Backups');
        const dateStr = new Date().toISOString().slice(0, 10);

        // Backup for each plant
        const plantOptions = [
            { id: PLANTS.SUPER,   name: 'JK Super',   saleBrand: 'dump',  voucherType: 'JK_Super',   lrCol: 'loading_receipts' },
            { id: PLANTS.LAKSHMI, name: 'JK Lakshmi', saleBrand: 'jkl',   voucherType: 'JK_Lakshmi', lrCol: 'jkl_loading_receipts' },
            { id: PLANTS.DUMP,    name: 'Dump',       saleBrand: null,    voucherType: 'Dump',        lrCol: null },
        ];

        // calculate LR range label helper
        const getRangeLabel = (items, dateString) => {
            if (!items || items.length === 0) return dateString;
            const lrNums = items.map(i => parseInt(i.lrNo) || 0).filter(n => n > 0);
            if (lrNums.length === 0) return dateString;
            const minLR = Math.min(...lrNums);
            const maxLR = Math.max(...lrNums);
            return minLR === maxLR ? `LR${minLR}_${dateString}` : `LR${minLR}-LR${maxLR}_${dateString}`;
        };

        for (const p of plantOptions) {
            const plantFolderId = await driveService.getOrCreateFolder(p.id, rootFolderId);
            console.log(`[Backup] Processing Plant: ${p.name}`);

            // 1. Sales Backup (skip Dump — no sales module)
            if (p.saleBrand) {
                try {
                    const allSales = await sellService.getAll();
                    const filtered = allSales.filter(s => s.brand === p.saleBrand);
                    const salesRows = filtered.map(s => [
                        s.date, (s.customerName || '').slice(0, 15), s.brand, s.material, s.quantity, s.rate, s.totalAmount, s.paymentStatus
                    ]);
                    await performModuleBackup('Sales', ['Date', 'Customer', 'Brand', 'Material', 'Qty', 'Rate', 'Total', 'Status'], salesRows, plantFolderId, getRangeLabel(filtered, dateStr));
                } catch (e) {
                    console.error(`[Backup] ${p.name} Sales Failed:`, e.message);
                    await driveService.logActivity(`${p.id}_Sales`, 'error', 'Backup failed', e);
                }
            }

            // 2. Vouchers Backup — detailed list matching balance sheet
            try {
                const voucherData = await voucherService.getVouchersByType(p.voucherType);
                if (voucherData && voucherData.length > 0) {
                    await performVoucherListBackup(p.name, voucherData, plantFolderId, getRangeLabel(voucherData, dateStr));
                }
            } catch (e) {
                console.error(`[Backup] ${p.name} Vouchers Failed:`, e.message);
                await driveService.logActivity(`${p.id}_Vouchers`, 'error', 'Backup failed', e);
            }

            // 3. Loading Receipts Backup
            try {
                const lrData = p.id === 'Dump' ? await lrService.getAllLRs() : await lrService.getJklLRs();
                if (lrData && lrData.length > 0) {
                    const lrRows = lrData.map(l => [
                        l.date, l.lrNo, (l.truckNo || '').slice(0, 12), l.material, l.totalBags, l.weight, (l.partyName || '').slice(0, 15)
                    ]);
                    await performModuleBackup('Weekly Loading Receipt', ['Date', 'LR No.', 'Truck', 'Material', 'Bags', 'Weight', 'Party'], lrRows, plantFolderId, getRangeLabel(lrData, dateStr));
                }
            } catch (e) {
                console.error(`[Backup] ${p.name} LRs Failed:`, e.message);
                await driveService.logActivity(`${p.id}_LRs`, 'error', 'Backup failed', e);
            }
        }

        // 4. Cashbook Backup (Overall)
        try {
            const cashData = await cashbookService.getAll();
            const cashRows = cashData.map(c => [
                c.date, c.type, c.amount, (c.remark || '').slice(0, 15)
            ]);
            await performModuleBackup('Cashbook_Overall', ['Date', 'Type', 'Amount', 'Remark'], cashRows, rootFolderId, dateStr);
        } catch (e) {
            console.error('[Backup] Cashbook Module Failed:', e.message);
            await driveService.logActivity('Cashbook', 'error', 'Backup failed', e);
        }

        console.log('[Backup] Weekly backup completed successfully.');
        await driveService.logActivity('System', 'success', 'Weekly backup cycle completed');
    } catch (err) {
        console.error('[Backup] Critical failure:', err.message);
        await driveService.logActivity('System', 'error', 'Critical backup failure', err);
    }
}

/**
 * Handles real-time backup for a single LR or Voucher entry.
 */
async function backupEntryToDrive(entryType, data, plantName = PLANTS.SUPER) {
    console.log(`[Realtime-Backup] Backing up ${entryType} for ${plantName}...`);
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    try {
        const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
        const plantId = await driveService.getOrCreateFolder(plantName, rootId);
        
        // Match the exact same routing as the inline routes!
        const ext = entryType === 'Voucher' ? 'Voucher' : 'Loading Receipt Individual';
        const folderId = await driveService.getOrCreateFolder(ext, plantId);

        const fileName = `${entryType}_${data.lrNo || data.id || Date.now()}.pdf`;
        const localPath = path.join(TEMP_DIR, fileName);

        // Use the dedicated PDF generator that matches the browser print format
        if (entryType === 'Voucher') {
            await pdfService.generateVoucherPDF(data, localPath);
        } else if (entryType === 'Loading_Receipt') {
            await pdfService.generateLoadingReceiptPDF(data, localPath);
        } else {
            await pdfService.generateReceiptPDF(entryType, data, localPath);
        }

        await driveService.uploadFile(localPath, fileName, folderId);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        await driveService.logActivity(`${entryType}_Individual`, 'success', `Entry backed up: ${fileName}`);
    } catch (e) {
        console.error('[Realtime-Backup] Failed:', e.message);
        await driveService.logActivity(`${entryType}_Individual`, 'error', 'Realtime backup failed', e);
    }
}

/**
 * Voucher list backup — detailed table matching the balance sheet columns.
 */
async function performVoucherListBackup(plantName, vouchers, rootId, dateStr) {
    const folderId = await driveService.getOrCreateFolder('Voucher', rootId);
    let fileLabel = typeof dateStr === 'string' && dateStr.includes('LR') ? dateStr : `Vouchers_${dateStr}`;

    const fileName = `Vouchers_${fileLabel}.pdf`;
    const localPath = path.join(TEMP_DIR, fileName);

    await pdfService.generateVoucherListPDF(plantName, vouchers, localPath);
    await driveService.uploadFile(localPath, fileName, folderId);

    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    console.log(`[Backup] Voucher list backed up for ${plantName}: ${fileName}`);
    await driveService.logActivity(`${plantName}_Vouchers`, 'success', `${vouchers.length} vouchers backed up → ${fileName}`);
}

/**
 * Helper to handle single module flow: PDF -> Upload -> Cleanup
 */
async function performModuleBackup(moduleName, headers, rows, rootId, labelStr) {
    const folderId = await driveService.getOrCreateFolder(moduleName, rootId);
    const fileName = `${moduleName}_${labelStr}.pdf`;
    const localPath = path.join(TEMP_DIR, fileName);

    await pdfService.generateModuleReport(moduleName, headers, rows, localPath);
    await driveService.uploadFile(localPath, fileName, folderId);
    
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    console.log(`[Backup] Finished ${moduleName}`);
}

module.exports = { runWeeklyBackup, backupEntryToDrive, PLANTS };
