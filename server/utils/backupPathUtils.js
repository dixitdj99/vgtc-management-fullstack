/**
 * backupPathUtils.js
 * 
 * Defines the single, canonical, self-explanatory directory structure
 * for all Google Drive backups across the entire VGTC system.
 * 
 * Root Folder: "VGTC_Backups"
 * 
 * Structure:
 *   VGTC_Backups/
 *     ├── Loading Receipts/
 *     │     ├── [Plant Name]/ (e.g. "JK Super (Jharli)", "JK Lakshmi (Jharli)", "Kosli", "Jhajjar", "Bahadurgarh")
 *     │     └── [YYYY-MM]/ (e.g. "2026-09")
 *     │           └── LR_1042_HR55AA1234_2026-09-17.pdf
 *     │
 *     ├── Vouchers/
 *     │     ├── [Voucher Type]/ (e.g. "Kosli Bill", "Jhajjar Bill", "Bahadurgarh Bill", "JK Super Dump", "JK Lakshmi")
 *     │     └── [YYYY-MM]/
 *     │           └── Voucher_501_HR55AA1234_2026-09-17.pdf
 *     │
 *     ├── Sales/
 *     │     ├── [Plant Name]/ (e.g. "JK Super", "JK Lakshmi")
 *     │     └── [YYYY-MM]/
 *     │           └── Sale_RC101_Ramesh_2026-09-17.pdf
 *     │
 *     ├── Invoices/
 *     │     └── [YYYY-MM]/
 *     │           └── Invoice_INV001_2026-09-17.pdf
 *     │
 *     ├── Cashbook/
 *     │     └── [YYYY-MM]/
 *     │
 *     └── Weekly Reports/
 *           └── [YYYY-MM]/
 */

/** Sanitize characters prohibited by file systems / Google Drive queries */
function safeName(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** Format YYYY-MM from Date or ISO / en-IN date string */
function formatMonthFolder(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 7);
  // Handle DD/MM/YYYY or DD-MM-YYYY
  if (typeof rawDate === 'string' && rawDate.includes('/')) {
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
      const month = String(parts[1]).padStart(2, '0');
      return `${year}-${month}`;
    }
  }
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  } catch (_) {}
  return new Date().toISOString().slice(0, 7);
}

/** Standardise Date string for file names (YYYY-MM-DD or DD-MM-YYYY sanitized) */
function formatDateForFileName(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  return String(rawDate).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 15);
}

/** Canonical Plant label for Loading Receipts */
function getLrPlantLabel(brand, source = '') {
  const b = String(brand || '').toLowerCase().trim();
  const s = String(source || '').toLowerCase().trim();

  if (b.includes('jkl') || b.includes('lakshmi') || s.includes('lakshmi')) {
    return 'JK Lakshmi (Jharli)';
  }
  if (b === 'kosli' || s.includes('kosli')) {
    return 'Kosli';
  }
  if (b === 'jhajjar' || s.includes('jhajjar')) {
    return 'Jhajjar';
  }
  if (b === 'bahadurgarh' || s.includes('bahadurgarh')) {
    return 'Bahadurgarh';
  }
  return 'JK Super (Jharli)';
}

/** Canonical Type label for Vouchers */
function getVoucherTypeLabel(type, brand = '') {
  const t = String(type || '').trim();
  const b = String(brand || '').toLowerCase().trim();

  if (t === 'Kosli_Bill' || t.toLowerCase().includes('kosli') || b === 'kosli') {
    return 'Kosli Bill';
  }
  if (t === 'Jajjhar_Bill' || t === 'Jhajjar_Bill' || t.toLowerCase().includes('jhajjar') || b === 'jhajjar') {
    return 'Jhajjar Bill';
  }
  if (t === 'Bahadurgarh_Bill' || t.toLowerCase().includes('bahadurgarh') || b === 'bahadurgarh') {
    return 'Bahadurgarh Bill';
  }
  if (t === 'JK_Lakshmi' || b === 'jklakshmi' || b === 'jkl') {
    return 'JK Lakshmi';
  }
  return 'JK Super Dump';
}

/** Canonical Plant label for Sales */
function getSalePlantLabel(brand) {
  const b = String(brand || '').toLowerCase().trim();
  if (b === 'jkl' || b.includes('lakshmi')) return 'JK Lakshmi';
  return 'JK Super';
}

/**
 * Returns the folder segments relative to VGTC_Backups root.
 * 
 * @param {object} params
 * @param {string} params.module 'Loading Receipts' | 'Vouchers' | 'Sales' | 'Invoices' | 'Cashbook' | 'Weekly Reports'
 * @param {string} [params.brand] Plant/Brand key
 * @param {string} [params.type] Voucher / document type
 * @param {string} [params.plant] Explicit plant label
 * @param {string|Date} [params.date] Document date
 * @returns {string[]} e.g. ['Loading Receipts', 'JK Super (Jharli)', '2026-09']
 */
function resolveBackupFolderSegments({ module, brand, type, plant, source, date }) {
  const m = String(module || '').toLowerCase().trim();
  const monthFolder = formatMonthFolder(date);

  // 1. Loading Receipts
  if (m.includes('load') || m.includes('lr') || m === 'receipts') {
    const plantFolder = plant ? safeName(plant) : getLrPlantLabel(brand, source);
    return ['Loading Receipts', plantFolder, monthFolder];
  }

  // 2. Vouchers
  if (m.includes('voucher')) {
    const typeFolder = plant ? safeName(plant) : getVoucherTypeLabel(type, brand);
    return ['Vouchers', typeFolder, monthFolder];
  }

  // 3. Sales
  if (m.includes('sale') || m.includes('sell')) {
    const plantFolder = plant ? safeName(plant) : getSalePlantLabel(brand);
    return ['Sales', plantFolder, monthFolder];
  }

  // 4. Invoices
  if (m.includes('invoice')) {
    return ['Invoices', monthFolder];
  }

  // 5. Cashbook
  if (m.includes('cashbook')) {
    return ['Cashbook', monthFolder];
  }

  // 6. Weekly Reports / Lists
  if (m.includes('weekly') || m.includes('report') || m.includes('list') || m.includes('export')) {
    return ['Weekly Reports', monthFolder];
  }

  // 7. Balance Sheet / Statements
  if (m.includes('balance') || m.includes('statement')) {
    return ['Balance Sheet', monthFolder];
  }

  // Fallback
  return [safeName(module) || 'Other', monthFolder];
}

/**
 * Generates a clean, consistent, safe file name with .pdf extension.
 */
function resolveBackupFileName({ module, id, lrNo, voucherNo, truckNo, customerName, date, name }) {
  if (name) {
    let clean = safeName(name);
    if (!clean.toLowerCase().endsWith('.pdf')) clean += '.pdf';
    return clean;
  }

  const m = String(module || '').toLowerCase().trim();
  const dateStr = formatDateForFileName(date);
  const cleanTruck = truckNo ? safeName(truckNo).replace(/\s+/g, '') : '';

  if (m.includes('load') || m.includes('lr')) {
    const num = lrNo || id || 'N-A';
    return `LR_${num}${cleanTruck ? '_' + cleanTruck : ''}_${dateStr}.pdf`;
  }

  if (m.includes('voucher')) {
    const num = voucherNo || (lrNo ? `LR${lrNo}` : '') || id || 'N-A';
    return `Voucher_${num}${cleanTruck ? '_' + cleanTruck : ''}_${dateStr}.pdf`;
  }

  if (m.includes('sale') || m.includes('sell')) {
    const cust = customerName ? safeName(customerName).replace(/\s+/g, '_') : 'Customer';
    return `Sale_${cust}_${id || dateStr}.pdf`;
  }

  if (m.includes('invoice')) {
    return `Invoice_${id || 'INV'}_${dateStr}.pdf`;
  }

  return `${safeName(module || 'Doc')}_${id || dateStr}.pdf`;
}

module.exports = {
  safeName,
  formatMonthFolder,
  formatDateForFileName,
  getLrPlantLabel,
  getVoucherTypeLabel,
  getSalePlantLabel,
  resolveBackupFolderSegments,
  resolveBackupFileName,
};
