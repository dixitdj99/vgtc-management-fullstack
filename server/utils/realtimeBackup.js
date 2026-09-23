/**
 * realtimeBackup.js
 * 
 * Centralized, standardized backup orchestrator for Google Drive & Google Sheets.
 * 
 * Guarantees:
 * 1. Single canonical, intuitive folder structure:
 *    VGTC_Backups / [Module] / [Plant or Voucher Type] / [YYYY-MM]
 * 2. 100% PDF format — no raw .html or unrenderable files in Google Drive.
 * 3. Upsert semantics: reprinting or editing updates the existing file instead
 *    of creating confusing duplicates.
 * 4. Non-blocking: failures are logged cleanly and never crash caller workflows.
 */

const backupPathUtils = require('./backupPathUtils');
const pdfService = require('./pdfService');
const htmlPdfService = require('./htmlPdfService');
const driveService = require('./driveService');
const sheetsService = require('./sheetsService');

/**
 * Backs up a Loading Receipt to Google Drive and syncs to Google Sheets.
 * 
 * @param {object} lrData LR document record
 * @param {object} [context] Optional overrides
 * @param {string} [context.brand]
 * @param {string} [context.source]
 * @param {string} [context.plant]
 * @returns {Promise<{backedUp: boolean, id?: string, fileName?: string, path?: string}>}
 */
async function backupLoadingReceipt(lrData, context = {}) {
  try {
    if (!lrData) return { backedUp: false, reason: 'No LR data provided' };

    const isAuth = await driveService.isAuthorized().catch(() => false);
    if (!isAuth) {
      console.log('[Backup] Skipping LR backup — Google Drive not authorized');
      return { backedUp: false, reason: 'Google Drive not authorized' };
    }

    const brand = lrData.brand || context.brand || '';
    const source = lrData.source || lrData.loadingPoint || context.source || '';
    const plant = context.plant || lrData.plant || null;
    const date = lrData.date || new Date();

    const segments = backupPathUtils.resolveBackupFolderSegments({
      module: 'Loading Receipts',
      brand,
      source,
      plant,
      date,
    });

    const fileName = backupPathUtils.resolveBackupFileName({
      module: 'Loading Receipts',
      lrNo: lrData.lrNo,
      truckNo: lrData.truckNo,
      date,
    });

    console.log(`[Backup] Generating Loading Receipt PDF: ${fileName} -> ${segments.join('/')}`);
    const pdfBuffer = await pdfService.generateLoadingReceiptPDFBuffer(lrData);

    const folderId = await driveService.ensurePath(segments);
    const res = await driveService.upsertBuffer(pdfBuffer, fileName, folderId, 'application/pdf');

    // Google Sheets Sync
    const sheetBrand = String(brand).toLowerCase().includes('jkl') || String(brand).toLowerCase().includes('lakshmi')
      ? 'jklakshmi'
      : 'jksuper';
    await sheetsService.upsertLrRow(lrData, sheetBrand).catch((e) => {
      console.warn('[Backup] Sheets LR sync warning:', e.message);
    });

    const msg = `${res.replaced ? 'Updated' : 'Saved'} ${fileName} in ${segments.join('/')}`;
    await driveService.logActivity('LR_Backup', 'success', msg);
    console.log(`[Backup] LR backup success: ${msg}`);

    return { backedUp: true, id: res.id, replaced: res.replaced, fileName, path: segments.join('/') };
  } catch (err) {
    console.error('[Backup] Loading Receipt backup error:', err.message, err.stack);
    await driveService.logActivity('LR_Backup', 'error', 'Backup failed', err).catch(() => {});
    return { backedUp: false, reason: err.message };
  }
}

/**
 * Backs up a Voucher to Google Drive and syncs to Google Sheets.
 * 
 * @param {object} voucherData Voucher document record
 * @param {object} [context] Optional overrides
 * @param {string} [context.brand]
 * @param {string} [context.type]
 * @param {string} [context.plant]
 * @returns {Promise<{backedUp: boolean, id?: string, fileName?: string, path?: string}>}
 */
async function backupVoucher(voucherData, context = {}) {
  try {
    if (!voucherData) return { backedUp: false, reason: 'No Voucher data provided' };

    const isAuth = await driveService.isAuthorized().catch(() => false);
    if (!isAuth) {
      console.log('[Backup] Skipping Voucher backup — Google Drive not authorized');
      return { backedUp: false, reason: 'Google Drive not authorized' };
    }

    const type = voucherData.type || context.type || 'JK_Super';
    const brand = voucherData.brand || context.brand || '';
    const plant = context.plant || null;
    const date = voucherData.date || new Date();

    const segments = backupPathUtils.resolveBackupFolderSegments({
      module: 'Vouchers',
      type,
      brand,
      plant,
      date,
    });

    const fileName = backupPathUtils.resolveBackupFileName({
      module: 'Vouchers',
      voucherNo: voucherData.voucherNo,
      lrNo: voucherData.lrNo,
      truckNo: voucherData.truckNo,
      date,
    });

    console.log(`[Backup] Generating Voucher PDF: ${fileName} -> ${segments.join('/')}`);
    const pdfBuffer = await pdfService.generateVoucherPDFBuffer(voucherData);

    const folderId = await driveService.ensurePath(segments);
    const res = await driveService.upsertBuffer(pdfBuffer, fileName, folderId, 'application/pdf');

    // Google Sheets Sync
    await sheetsService.upsertVoucherRow(voucherData, type, brand).catch((e) => {
      console.warn('[Backup] Sheets Voucher sync warning:', e.message);
    });

    const msg = `${res.replaced ? 'Updated' : 'Saved'} ${fileName} in ${segments.join('/')}`;
    await driveService.logActivity('Voucher_Backup', 'success', msg);
    console.log(`[Backup] Voucher backup success: ${msg}`);

    return { backedUp: true, id: res.id, replaced: res.replaced, fileName, path: segments.join('/') };
  } catch (err) {
    console.error('[Backup] Voucher backup error:', err.message, err.stack);
    await driveService.logActivity('Voucher_Backup', 'error', 'Backup failed', err).catch(() => {});
    return { backedUp: false, reason: err.message };
  }
}

/**
 * Backs up a Sale record to Google Drive.
 * 
 * @param {object} saleData Sale record
 * @param {object} [context] Optional overrides
 * @param {string} [context.brand]
 * @param {string} [context.plant]
 * @returns {Promise<{backedUp: boolean, id?: string, fileName?: string, path?: string}>}
 */
async function backupSale(saleData, context = {}) {
  try {
    if (!saleData) return { backedUp: false, reason: 'No Sale data provided' };

    const isAuth = await driveService.isAuthorized().catch(() => false);
    if (!isAuth) {
      console.log('[Backup] Skipping Sale backup — Google Drive not authorized');
      return { backedUp: false, reason: 'Google Drive not authorized' };
    }

    const brand = saleData.brand || context.brand || '';
    const plant = context.plant || null;
    const date = saleData.date || new Date();

    const segments = backupPathUtils.resolveBackupFolderSegments({
      module: 'Sales',
      brand,
      plant,
      date,
    });

    const fileName = backupPathUtils.resolveBackupFileName({
      module: 'Sales',
      customerName: saleData.customerName,
      id: saleData.id,
      date,
    });

    console.log(`[Backup] Generating Sale PDF: ${fileName} -> ${segments.join('/')}`);
    const pdfBuffer = await pdfService.generateSalePDFBuffer(saleData);

    const folderId = await driveService.ensurePath(segments);
    const res = await driveService.upsertBuffer(pdfBuffer, fileName, folderId, 'application/pdf');

    const msg = `${res.replaced ? 'Updated' : 'Saved'} ${fileName} in ${segments.join('/')}`;
    await driveService.logActivity('Sale_Backup', 'success', msg);
    console.log(`[Backup] Sale backup success: ${msg}`);

    return { backedUp: true, id: res.id, replaced: res.replaced, fileName, path: segments.join('/') };
  } catch (err) {
    console.error('[Backup] Sale backup error:', err.message, err.stack);
    await driveService.logActivity('Sale_Backup', 'error', 'Backup failed', err).catch(() => {});
    return { backedUp: false, reason: err.message };
  }
}

/**
 * Universal backup function for documents received via the archive route or print window.
 * Always renders into a clean, professional PDF — never saves raw HTML to Google Drive.
 * 
 * @param {object} doc
 * @param {string} doc.module 'Loading Receipts' | 'Vouchers' | 'Sell' | 'Balance Sheet' etc.
 * @param {string} doc.kind 'Documents' | 'Statements' | 'Exports' etc.
 * @param {string} doc.name Document name
 * @param {string} [doc.html] Raw HTML from print window
 * @param {string} [doc.plant] Plant or godown label
 * @param {object} [doc.meta] Document metadata and payload
 * @returns {Promise<{archived: boolean, id?: string, replaced?: boolean, reason?: string}>}
 */
async function backupCustomDocument({ module, kind, name, html, plant, meta = {} }) {
  try {
    const isAuth = await driveService.isAuthorized().catch(() => false);
    if (!isAuth) {
      return { archived: false, reason: 'Google Drive is not connected' };
    }

    const mod = String(module || '').toLowerCase();
    const docData = meta?.docData || meta;

    // 1. If Loading Receipt
    if (mod.includes('load') || mod.includes('lr') || (meta?.lrNo && !meta?.type)) {
      const lrPayload = {
        ...docData,
        lrNo: docData.lrNo || meta.lrNo,
        truckNo: docData.truckNo || meta.truckNo,
        date: docData.date || meta.date,
        partyName: docData.partyName || meta.partyName,
        plant: plant || docData.plant,
      };
      const res = await backupLoadingReceipt(lrPayload, { plant, brand: docData.brand });
      return { archived: res.backedUp, id: res.id, replaced: res.replaced, reason: res.reason };
    }

    // 2. If Voucher
    if (mod.includes('voucher') || meta?.type) {
      const voucherPayload = {
        ...docData,
        voucherNo: docData.voucherNo || meta.voucherNo,
        lrNo: docData.lrNo || meta.lrNo,
        truckNo: docData.truckNo || meta.truckNo,
        date: docData.date || meta.date,
        type: docData.type || meta.type,
      };
      const res = await backupVoucher(voucherPayload, { plant, type: voucherPayload.type, brand: docData.brand });
      return { archived: res.backedUp, id: res.id, replaced: res.replaced, reason: res.reason };
    }

    // 3. If Sale
    if (mod.includes('sale') || mod.includes('sell')) {
      const salePayload = {
        ...docData,
        customerName: docData.customerName || meta.customerName,
        date: docData.date || meta.date,
        id: docData.id || meta.id,
      };
      const res = await backupSale(salePayload, { plant, brand: docData.brand });
      return { archived: res.backedUp, id: res.id, replaced: res.replaced, reason: res.reason };
    }

    // 4. Other documents (Balance Sheet, Cashbook, Stock, Challan, Profit & Loss):
    // Convert HTML into a clean A4 PDF buffer!
    const segments = backupPathUtils.resolveBackupFolderSegments({
      module: module || 'Reports',
      plant,
      date: meta?.date || new Date(),
    });

    let cleanFileName = backupPathUtils.safeName(name || 'Document');
    if (!cleanFileName.toLowerCase().endsWith('.pdf')) {
      cleanFileName = cleanFileName.replace(/\.html$/i, '') + '.pdf';
    }

    console.log(`[Backup] Converting HTML to PDF for: ${cleanFileName} -> ${segments.join('/')}`);
    const pdfBuffer = await htmlPdfService.convertHtmlToPdfBuffer(name, html || '');

    const folderId = await driveService.ensurePath(segments);
    const res = await driveService.upsertBuffer(pdfBuffer, cleanFileName, folderId, 'application/pdf');

    const msg = `${res.replaced ? 'Updated' : 'Saved'} ${cleanFileName} in ${segments.join('/')}`;
    await driveService.logActivity(`Archive_${module || 'Doc'}`, 'success', msg);
    console.log(`[Backup] Document backup success: ${msg}`);

    return { archived: true, id: res.id, replaced: res.replaced };
  } catch (err) {
    console.error('[Backup] Custom document backup error:', err.message, err.stack);
    await driveService.logActivity(`Archive_${module || 'Doc'}`, 'error', 'Backup failed', err).catch(() => {});
    return { archived: false, reason: err.message };
  }
}

module.exports = {
  backupLoadingReceipt,
  backupVoucher,
  backupSale,
  backupCustomDocument,
};
