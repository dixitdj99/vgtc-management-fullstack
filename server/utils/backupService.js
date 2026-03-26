const fs = require('fs');
const path = require('path');
const pdfService = require('./pdfService');
const driveService = require('./driveService');

// Data Services
const sellService = require('./sellService');
const voucherService = require('../services/voucherService');
const cashbookService = require('./cashbookService');

const TEMP_DIR = path.join(__dirname, '..', 'temp_backups');

/**
 * Orchestrates the weekly backup process.
 */
async function runWeeklyBackup() {
    console.log('[Backup] Starting weekly backup...');
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

    try {
        const rootFolderId = await driveService.getOrCreateFolder('VGTC_Backups');
        const dateStr = new Date().toISOString().slice(0, 10);

        // 1. Sales Backup
        const salesData = await sellService.getAll();
        const salesRows = salesData.map(s => [
            s.date, s.customerName, s.brand, s.material, s.quantity, s.rate, s.totalAmount, s.paymentStatus
        ]);
        await performModuleBackup('Sales', ['Date', 'Customer', 'Brand', 'Material', 'Qty', 'Rate', 'Total', 'Status'], salesRows, rootFolderId, dateStr);

        // 2. Vouchers Backup
        const voucherData = await voucherService.getVouchersByType('general'); // Example: only general for now, or fetch all
        const voucherRows = voucherData.map(v => [
            v.date, v.truckNo || 'N/A', v.partyName || 'N/A', v.amount
        ]);
        await performModuleBackup('Vouchers', ['Date', 'Truck', 'Party', 'Amount'], voucherRows, rootFolderId, dateStr);

        // 3. Cashbook Backup
        const cashData = await cashbookService.getAll();
        const cashRows = cashData.map(c => [
            c.date, c.type, c.amount, c.remark || ''
        ]);
        await performModuleBackup('Cashbook', ['Date', 'Type', 'Amount', 'Remark'], cashRows, rootFolderId, dateStr);

        console.log('[Backup] Weekly backup completed successfully.');
    } catch (err) {
        console.error('[Backup] Critical failure:', err.message);
    }
}

/**
 * Helper to handle single module flow: PDF -> Upload -> Cleanup
 */
async function performModuleBackup(moduleName, headers, rows, rootId, dateStr) {
    const folderId = await driveService.getOrCreateFolder(moduleName, rootId);
    const fileName = `${moduleName}_${dateStr}.pdf`;
    const localPath = path.join(TEMP_DIR, fileName);

    await pdfService.generateModuleReport(moduleName, headers, rows, localPath);
    await driveService.uploadFile(localPath, fileName, folderId);
    
    // Cleanup
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    console.log(`[Backup] Finished ${moduleName}`);
}

module.exports = { runWeeklyBackup };
