const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');
const { printableExtras } = require('./voucherExtras');

const NONE_PUMP = 'None';
const getPumpDisplay = (pump) => pump && pump !== NONE_PUMP ? pump : '—';

/**
 * Generates a PDF report for a specific module (generic table format).
 */
async function generateModuleReport(moduleName, headers, rows, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        doc.fontSize(20).text('VGTC MANAGEMENT SYSTEM', { align: 'center' });
        doc.fontSize(14).text(`${moduleName.toUpperCase()} BACKUP REPORT`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        const table = { title: moduleName, headers, rows };
        doc.table(table, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
            prepareRow: () => doc.font('Helvetica').fontSize(8),
        });

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

/**
 * Generates a professional single-page PDF for an individual receipt/voucher.
 */
async function generateReceiptPDF(title, data, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A5', layout: 'landscape' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        doc.rect(30, 30, doc.page.width - 60, 50).fill('#f8fafc');
        doc.fillColor('#1e293b').fontSize(18).font('Helvetica-Bold').text('VIKAS GOODS TRANSPORT', 40, 45, { align: 'center' });
        doc.fontSize(10).font('Helvetica').text(title.toUpperCase(), 40, 65, { align: 'center' });
        doc.moveDown(2.5);
        doc.fillColor('#000');

        const startY = 100;
        const col1 = 50;
        const col2 = 280;

        let displayWeight = data.weight || 0;
        let displayBags = data.totalBags || data.bags || 0;
        if (data.materials && Array.isArray(data.materials)) {
            displayWeight = data.materials.reduce((sum, m) => sum + (parseFloat(m.weight) || 0), 0);
            displayBags = data.materials.reduce((sum, m) => sum + (parseInt(m.bags) || 0), 0);
        }

        const drawRow = (label, value, y) => {
            doc.fontSize(9).fillColor('#64748b').text(label.toUpperCase(), col1, y);
            doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(String(value || '—'), col1, y + 12);
        };
        const drawRowRight = (label, value, y) => {
            doc.fontSize(9).fillColor('#64748b').text(label.toUpperCase(), col2, y);
            doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(String(value || '—'), col2, y + 12);
        };

        drawRow('Receipt No / LR No', `#${data.lrNo || data.id || 'N/A'}`, startY);
        drawRowRight('Date', data.date, startY);
        drawRow('Truck Number', data.truckNo, startY + 40);
        drawRowRight('Destination', data.destination, startY + 40);
        drawRow('Weight / Qty', `${displayWeight} MT (${displayBags} Bags)`, startY + 80);
        drawRowRight('Party / Company', data.partyName || data.ownerName || '—', startY + 80);

        if (data.materials && data.materials.length > 0) {
            doc.moveDown(6);
            const table = {
                headers: [
                    { label: 'Material', property: 'type', width: 150 },
                    { label: 'Bags', property: 'bags', width: 100 },
                    { label: 'Weight (MT)', property: 'weight', width: 100 }
                ],
                rows: data.materials.map(m => [m.type, m.bags, `${m.weight} MT`])
            };
            doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9),
                prepareRow: () => doc.font('Helvetica').fontSize(9),
            });
        }

        const total = data.totalAmount || data.total || 0;
        const totalY = data.materials && data.materials.length > 0 ? Math.max(220, doc.y + 20) : 220;
        doc.rect(30, totalY, doc.page.width - 60, 40).fill('#1e293b');
        doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold').text('TOTAL AMOUNT / STATUS', 50, totalY + 13);
        doc.text(`Rs. ${total} | ${data.billing || 'N/A'}`, col2, totalY + 13, { align: 'left' });

        doc.fillColor('#94a3b8').fontSize(8).text(`System Backup ID: ${data.id || 'N/A'} | Generated: ${new Date().toLocaleString()}`, 30, doc.page.height - 40, { align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

/**
 * Generates a voucher PDF that exactly matches the browser print slip from VoucherModule.jsx.
 * Used for individual per-creation backups.
 */
function buildVoucherBillDoc(v, doc) {
    const PW = 595.28;
    const PH = 419.53;
    const M = 15;

    const gross = v.deliveries?.length > 0
        ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
        : (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);

    const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
    const diesel   = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
    const cash     = parseFloat(v.advanceCash) || 0;
    const online   = parseFloat(v.advanceOnline) || 0;
    const isBill   = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill' || v.type === 'Bahadurgarh_Bill';
    const munshi   = isBill ? 0 : (parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0));
    const shortage  = parseFloat(v.shortage) || 0;
    const commission = parseFloat(v.commission) || 0;
    const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
    const tyreGreasing = (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0);
    const extraCash  = parseFloat(v.extraCash) || 0;
    const totalDeductions = diesel + cash + online + munshi + shortage + commission + tyrePuncture + tyreGreasing + extraCash;
    const net = gross - totalDeductions;

    doc.rect(M, M, PW - M * 2, PH - M * 2).strokeColor('#000').lineWidth(1).stroke();
    
    let y = M + 5;
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text('M/S. VIKAS GOODS TRANSPORT CO.', M, y, { align: 'center' });
    y += 20;
    
    doc.rect(M + (PW - M * 2) / 2 - 100, y, 200, 14).fillAndStroke('#000', '#000');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff').text('Authorised Transport for : J.K. Super Cement Ltd.', M, y + 3, { align: 'center' });
    y += 18;
    
    doc.fillColor('#000').fontSize(8).font('Helvetica-Bold').text('Near Gaushala, Rewari Road, Jhajjar (Hr.)', M, y, { align: 'center' });
    y += 10;
    doc.text('Mob. : 9416319445, 9728954901, 9728284849', M, y, { align: 'center' });
    y += 10;
    doc.fontSize(7).font('Helvetica').text('Head Office : Near Rao Gopal Dev Chowk, Narnaul Road, Rewari', M, y, { align: 'center' });
    doc.fontSize(7).font('Helvetica-Bold').text('GSTIN : 06ARIPK9021C2Z2', PW - M - 120, M + 10);
    
    y += 12;
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#000').lineWidth(1).stroke();
    
    // Info grid
    const col1 = M + 100;
    const col2 = M + 300;
    doc.moveTo(col1, y).lineTo(col1, y + 45).stroke();
    doc.moveTo(col2, y).lineTo(col2, y + 45).stroke();
    
    doc.fontSize(8).font('Helvetica-Bold').text('Consignor', M + 5, y + 5);
    doc.moveTo(M, y + 15).lineTo(col1, y + 15).stroke();
    doc.text('J.K. Super Cement Ltd.', M + 5, y + 20);
    doc.moveTo(M, y + 30).lineTo(col1, y + 30).stroke();
    const consignorBranch = v.type === 'Kosli_Bill' ? 'Kosli' : (v.type === 'Jajjhar_Bill' ? 'Jhajjar' : 'Bahadurgarh');
    doc.text(consignorBranch, M + 5, y + 35, { align: 'center', width: col1 - M });
    
    const pName = v.partyName ? v.partyName.replace(/^m\/s\.?\s*/i, '').replace(/[\.\-_\s]+$/, '') : '';
    doc.text(`M/s.  ${pName}`, col1 + 5, y + 5, { width: 190 });
    doc.moveTo(col1, y + 15).lineTo(col2, y + 15).stroke();
    
    if (v.partyCode) {
        doc.fontSize(7).text(`Party Code:  ${v.partyCode}`, col1 + 5, y + 18);
    }
    doc.moveTo(col1, y + 30).lineTo(col2, y + 30).stroke();
    doc.fontSize(8);
    doc.text('S.T.L. No.', col1 + 5, y + 35);
    doc.text('C.S.T. No.', col1 + 100, y + 35);
    
    doc.text(`Truck No.  ${v.truckNo || ''}`, col2 + 5, y + 5);
    doc.moveTo(col2, y + 15).lineTo(PW - M, y + 15).stroke();
    const fromBranch = v.type === 'Kosli_Bill' ? 'Kosli' : (v.type === 'Jajjhar_Bill' ? 'Jhajjar' : 'Bahadurgarh');
    doc.text(`From : ${fromBranch}`, col2 + 5, y + 18);
    doc.moveTo(col2, y + 30).lineTo(PW - M, y + 30).stroke();
    doc.text(`To  ${v.destination || ''}`, col2 + 50, y + 18);
    doc.text(`LR No. ${v.lrNo || ''}`, col2 + 5, y + 35);
    doc.font('Helvetica').text(`Date: ${v.date || ''}`, col2 + 100, y + 35);
    
    y += 45;
    doc.moveTo(M, y).lineTo(PW - M, y).stroke();
    
    const cw1 = 40, cw2 = 120, cw3 = 60, cw4 = 40, cw5 = 60, cw6 = 60, cw7 = 60;
    let cwX = [M + cw1, M + cw1 + cw2, M + cw1 + cw2 + cw3, M + cw1 + cw2 + cw3 + cw4, M + cw1 + cw2 + cw3 + cw4 + cw5, M + cw1 + cw2 + cw3 + cw4 + cw5 + cw6, M + cw1 + cw2 + cw3 + cw4 + cw5 + cw6 + cw7];
    
    cwX.forEach((x, i) => { if (i < cwX.length - 1) doc.moveTo(x, y).lineTo(x, PH - M - 40).stroke(); });
    
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('No. of Bags', M + 5, y + 5, { width: cw1 - 10, align: 'center' });
    doc.text('Description said to contain', cwX[0] + 5, y + 5, { width: cw2 - 10, align: 'center' });
    doc.text('Actual Weight', cwX[1] + 5, y + 2, { width: cw3 - 10, align: 'center' });
    doc.moveTo(cwX[1], y + 12).lineTo(cwX[2], y + 12).stroke();
    doc.text('Qn.', cwX[1] + 2, y + 15);
    doc.moveTo(cwX[1] + cw3/2, y + 12).lineTo(cwX[1] + cw3/2, PH - M - 40).stroke();
    doc.text('Kg.', cwX[1] + cw3/2 + 2, y + 15);
    doc.text('Rate', cwX[2] + 5, y + 5, { width: cw4 - 10, align: 'center' });
    
    ['FRIEGHT', 'Paid', 'To Pay'].forEach((lbl, i) => {
        const bx = cwX[3 + i];
        doc.text(lbl, bx + 5, y + 2, { width: cw5 - 10, align: 'center' });
        doc.moveTo(bx, y + 12).lineTo(bx + cw5, y + 12).stroke();
        doc.text('Rs.', bx + 5, y + 15);
        doc.moveTo(bx + cw5 - 15, y + 12).lineTo(bx + cw5 - 15, PH - M - 40).stroke();
        doc.text('P.', bx + cw5 - 12, y + 15);
    });
    
    doc.text('Remark', cwX[6] + 5, y + 5, { width: PW - M - cwX[6] - 10, align: 'center' });
    
    y += 25;
    doc.moveTo(M, y).lineTo(PW - M, y).stroke();
    
    doc.fontSize(9).font('Helvetica').text(v.bags || '', M + 5, y + 10, { width: cw1 - 10, align: 'center' });
    const descY = y + 5;
    
    doc.fontSize(8).font('Helvetica-Bold').text('CEMENT', cwX[0] + 5, descY, { align: 'center', width: cw2 - 10 });
    doc.moveTo(cwX[0], descY + 12).lineTo(cwX[1], descY + 12).stroke();
    
    if (v.materials && v.materials.length > 0) {
        let matY = descY + 15;
        v.materials.forEach(m => {
            doc.fontSize(7).font('Helvetica').text(m.type || m.material, cwX[0] + 5, matY);
            doc.text(m.bags + ' Bags', cwX[0] + 60, matY);
            matY += 10;
        });
    } else {
        doc.fontSize(7).font('Helvetica').text('Grade:\nJ.K. Super Cement / PPC / 43 / 53', cwX[0] + 5, descY + 15);
    }
    
    doc.text(v.weight ? v.weight + ' MT' : '', cwX[1] + 5, y + 10, { width: cw3 - 10, align: 'center' });
    doc.text(v.rate ? `Rs.${v.rate}` : '', cwX[2] + 5, y + 10, { width: cw4 - 10, align: 'center' });
    doc.text(`Rs.${Math.round(gross).toLocaleString()}`, cwX[3] + 5, y + 10, { width: cw5 - 10, align: 'center' });
    
    // Bottom calculation box
    y = PH - M - 95;
    doc.moveTo(M, y).lineTo(PW - M, y).stroke();
    
    doc.fontSize(8).font('Helvetica-Bold').text('Advance Details:', M + 5, y + 4);
    let advY = y + 15;
    doc.fontSize(7).font('Helvetica');
    if (diesel > 0 || dieselPending) {
        doc.text(`Diesel: ${dieselPending ? 'Pending' : 'Rs.' + diesel.toLocaleString()} (${v.pump || 'Pump'})`, M + 5, advY);
        advY += 10;
    }
    if (cash > 0) { doc.text(`Cash: Rs.${cash.toLocaleString()}`, M + 5, advY); advY += 10; }
    if (online > 0) { doc.text(`Online: Rs.${online.toLocaleString()}`, M + 5, advY); advY += 10; }
    if (munshi > 0) { doc.text(`Munshi: Rs.${munshi.toLocaleString()}`, M + 5, advY); advY += 10; }
    
    // Totals line
    y = PH - M - 40;
    doc.moveTo(M, y).lineTo(PW - M, y).stroke();
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('TOTAL', M + 5, y + 3, { width: cw1 - 10, align: 'center' });
    doc.text(v.weight ? v.weight + ' MT' : '', cwX[1] + 5, y + 3, { width: cw3 - 10, align: 'center' });
    doc.text(`Gross: Rs.${Math.round(gross).toLocaleString()}`, cwX[3] + 5, y + 3, { width: cw5 * 3 - 10, align: 'center' });
    
    y += 15;
    doc.moveTo(M, y).lineTo(PW - M, y).stroke();
    
    doc.fontSize(6).font('Helvetica').text('*I/We declare that we have not taken credit of Excise Duty paid on inputs... All Disputes arising out of it shall have the Jurisdiction for Jhajjar', M + 5, y + 2);
    doc.font('Helvetica-Bold').text('Service Tax to be paid by Consignor', M + 5, y + 10, { align: 'center', width: PW - M * 2 });
    
    y += 20;
    doc.fontSize(8);
    doc.text('Sign. of Driver', M + cw1 + 20, y);
    doc.text('Sign. of Clerk for VIKAS GOODS TRANSPORT', PW - M - 200, y, { align: 'right', width: 190 });
}

function buildNonBillVoucherDoc(v, doc) {
    const PW = doc.page.width, PH = doc.page.height, M = 24, CW = PW - M * 2;
    let y = M;

    // Outer border
    doc.rect(M, M, CW, PH - M * 2).strokeColor('#000').lineWidth(1.2).stroke();

    const hasDeliveries = v.deliveries && v.deliveries.length > 0;
    const gross = hasDeliveries
        ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
        : (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);

    const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
    const diesel   = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
    const cash     = parseFloat(v.advanceCash) || 0;
    const online   = parseFloat(v.advanceOnline) || 0;
    const weight   = parseFloat(v.weight) || (hasDeliveries ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0) : 0);
    const isBill   = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill' || v.type === 'Bahadurgarh_Bill';
    const munshi   = isBill ? 0 : (parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0));
    const shortage = parseFloat(v.shortage) || 0;
    const commission = parseFloat(v.commission) || 0;
    const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
    const tyreGreasing = (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0);
    const extraCash  = parseFloat(v.extraCash) || 0;
    const totalDeductions = diesel + cash + online + munshi + shortage + commission + tyrePuncture + tyreGreasing + extraCash;
    const net = gross - totalDeductions;

    // Header
    y += 10;
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text('VIKAS GOODS TRANSPORT CO.', M, y, { align: 'center', width: CW });
    y += 18;
    const sub = v.type ? v.type.replace(/_/g, ' ').toUpperCase() : 'FREIGHT ADVANCE VOUCHER';
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text(`FREIGHT ADVANCE VOUCHER (${sub})`, M, y, { align: 'center', width: CW });
    y += 13;
    doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text('Metro Market, Behind SBI Bank, Jhamri Mod, Jharli, Jhajjar | Mob: 9416319445 | GSTIN: 06ARIPK9021C2Z2', M, y, { align: 'center', width: CW });
    y += 12;
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#000').lineWidth(1).stroke();
    y += 8;

    // Badges Row: Voucher No & LR No
    const lrDisplay = hasDeliveries
        ? v.deliveries.map(d => d.lrNo).filter(Boolean).map(n => `#${n}`).join(', ') || (v.lrNo ? `#${v.lrNo}` : 'AUTO')
        : (v.lrNo ? `#${v.lrNo}` : 'AUTO');
    const vNo = v.voucherNo || v.entryId || v.id || '—';

    doc.rect(M + 10, y, (CW - 30) / 2, 20).fillAndStroke('#0f172a', '#0f172a');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff').text(`VOUCHER # ${vNo}`, M + 10, y + 5, { align: 'center', width: (CW - 30) / 2 });

    doc.rect(M + 20 + (CW - 30) / 2, y, (CW - 30) / 2, 20).strokeColor('#0f172a').lineWidth(1).stroke();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(`LR(s): ${lrDisplay}`, M + 20 + (CW - 30) / 2, y + 5, { align: 'center', width: (CW - 30) / 2 });
    y += 28;

    // Info Grid
    const drawRow = (lbl1, val1, lbl2, val2) => {
        const colW = CW / 2;
        doc.rect(M, y, colW, 20).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.rect(M + colW, y, colW, 20).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text(lbl1.toUpperCase(), M + 8, y + 3);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(String(val1 || '—'), M + 8, y + 10, { width: colW - 16, ellipsis: true });

        if (lbl2) {
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text(lbl2.toUpperCase(), M + colW + 8, y + 3);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(String(val2 || '—'), M + colW + 8, y + 10, { width: colW - 16, ellipsis: true });
        }
        y += 20;
    };

    drawRow('Date', v.date || new Date().toLocaleDateString('en-IN'), 'Truck Number', (v.truckNo || '—').toUpperCase());
    drawRow('Party / Consignee', v.partyName || '—', 'Destination', v.destination || '—');
    drawRow('Driver Name', v.driverName || '—', 'Fuel Pump', v.pump && v.pump !== 'None' ? v.pump : 'None');
    y += 8;

    // Metrics Row
    const cardW = (CW - 18) / 4;
    const cards = [
        { label: 'WEIGHT', val: `${weight.toFixed(2)} MT` },
        { label: 'BAGS', val: `${bags} Bags` },
        { label: 'RATE', val: v.rate ? `Rs.${v.rate}/MT` : '—' },
        { label: 'GROSS FREIGHT', val: `Rs.${Math.round(gross).toLocaleString('en-IN')}` }
    ];
    cards.forEach((c, i) => {
        const cx = M + i * (cardW + 6);
        doc.rect(cx, y, cardW, 26).fillAndStroke('#f8fafc', '#cbd5e1');
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#64748b').text(c.label, cx + 4, y + 3, { align: 'center', width: cardW - 8 });
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(c.val, cx + 4, y + 13, { align: 'center', width: cardW - 8 });
    });
    y += 34;

    // Deductions Table
    doc.rect(M, y, CW, 18).fill('#1e293b');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff').text('DEDUCTION / ADVANCE PARTICULARS', M + 8, y + 5);
    doc.text('AMOUNT (RS)', M + 8, y + 5, { width: CW - 16, align: 'right' });
    y += 18;

    const deductionLines = [
        { label: 'Diesel Advance' + (v.pump && v.pump !== 'None' ? ` (${v.pump})` : ''), val: diesel, pending: dieselPending },
        { label: 'Cash Advance', val: cash },
        { label: 'Online Advance', val: online },
        { label: 'Munshi', val: munshi },
        { label: 'Shortage', val: shortage },
        { label: 'Commission', val: commission },
        { label: 'Tyre Puncture', val: tyrePuncture },
        { label: 'Tyre Greasing & Air', val: tyreGreasing },
        { label: 'Extra Cash' + (v.extraCashRemark ? ` (${v.extraCashRemark})` : ''), val: extraCash },
    ].filter(d => d.val > 0 || d.pending);

    if (!deductionLines.length) {
        doc.rect(M, y, CW, 18).fillAndStroke('#fff', '#cbd5e1');
        doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('No advance deductions recorded for this trip.', M + 8, y + 5);
        y += 18;
    } else {
        deductionLines.forEach((d, idx) => {
            const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
            doc.rect(M, y, CW, 18).fillAndStroke(bg, '#cbd5e1');
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e293b').text(d.label, M + 8, y + 5);
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000').text(
                d.pending ? 'FULL (Pending)' : `- Rs. ${Math.round(d.val).toLocaleString('en-IN')}`,
                M + 8, y + 5, { width: CW - 16, align: 'right' }
            );
            y += 18;
        });
    }

    // Total deductions
    doc.rect(M, y, CW, 18).fillAndStroke('#f1f5f9', '#94a3b8');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text('TOTAL DEDUCTIONS:', M + 8, y + 5);
    doc.text(`- Rs. ${Math.round(totalDeductions).toLocaleString('en-IN')}`, M + 8, y + 5, { width: CW - 16, align: 'right' });
    y += 24;

    // Net Payable Highlight Banner
    doc.rect(M, y, CW, 24).fillAndStroke('#0f172a', '#0f172a');
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#fff').text('NET BALANCE PAYABLE:', M + 10, y + 6);
    doc.text(`Rs. ${Math.round(net).toLocaleString('en-IN')}`, M + 10, y + 6, { width: CW - 20, align: 'right' });
    y += 32;

    // Payment Status Stamp
    const isPaid = (v.paymentStatus || '').toLowerCase() === 'paid';
    doc.rect(M + 8, y, 120, 20).lineWidth(1.5).strokeColor(isPaid ? '#10b981' : '#f59e0b').stroke();
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(isPaid ? '#10b981' : '#d97706').text(
        isPaid ? '✔ PAID IN FULL' : '⏳ BALANCE PENDING',
        M + 8, y + 5, { width: 120, align: 'center' }
    );

    // Signatures
    const sigY = PH - M - 60;
    const sigW = (CW - 20) / 3;
    const sigs = ['Driver Signature', 'Munshi / Manager', 'Authorized Signatory (VGTC)'];
    sigs.forEach((lbl, i) => {
        const sx = M + i * (sigW + 10);
        doc.rect(sx, sigY, sigW, 42).strokeColor('#94a3b8').lineWidth(0.5).stroke();
        doc.moveTo(sx + 8, sigY + 28).lineTo(sx + sigW - 8, sigY + 28).strokeColor('#cbd5e1').stroke();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#334155').text(lbl, sx, sigY + 31, { width: sigW, align: 'center' });
    });

    // Footer
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8').text(`VGTC Smart Logistics Portal • Backed up on ${new Date().toLocaleString('en-IN')}`, M, PH - M - 12, { align: 'center', width: CW });
}

async function generateVoucherPDF(v, outputPath) {
    return new Promise((resolve, reject) => {
        const isBill = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill' || v.type === 'Bahadurgarh_Bill';
        const doc = new PDFDocument(isBill ? { margin: 20, size: 'A5', layout: 'landscape' } : { margin: 24, size: 'A5' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        if (isBill) buildVoucherBillDoc(v, doc);
        else buildNonBillVoucherDoc(v, doc);
        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

async function generateVoucherPDFBuffer(v) {
    return new Promise((resolve, reject) => {
        const isBill = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill' || v.type === 'Bahadurgarh_Bill';
        const doc = new PDFDocument(isBill ? { margin: 20, size: 'A5', layout: 'landscape' } : { margin: 24, size: 'A5' });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        if (isBill) buildVoucherBillDoc(v, doc);
        else buildNonBillVoucherDoc(v, doc);
        doc.end();
    });
}

function buildLoadingReceiptPdf(data, doc) {
    const materials = data.materials && data.materials.length > 0
        ? data.materials
        : [{ type: data.material || 'Cement', bags: data.totalBags || data.bags || 0, weight: data.weight || 0, loadingType: data.loadingType || 'From Godown' }];

    const totalBags = materials.reduce((s, m) => s + (parseInt(m.bags || m.totalBags) || 0), 0);
    const totalWeight = materials.reduce((s, m) => s + (parseFloat(m.weight) || 0), 0);

    const PW = doc.page.width, PH = doc.page.height, M = 24, CW = PW - M * 2;
    let y = M;

    // Outer border
    doc.rect(M, M, CW, PH - M * 2).strokeColor('#000').lineWidth(1.2).stroke();

    // Determine plant title
    const b = String(data.brand || '').toLowerCase();
    const src = String(data.source || data.loadingPoint || '').toLowerCase();
    let plantSubtitle = 'JK SUPER PLANT LOADING RECEIPT (JHARLI)';
    if (b.includes('jkl') || b.includes('lakshmi') || src.includes('lakshmi')) {
        plantSubtitle = 'JK LAKSHMI PLANT LOADING RECEIPT (JHARLI)';
    } else if (b === 'kosli' || src.includes('kosli')) {
        plantSubtitle = 'JK SUPER CEMENT DEPO — KOSLI';
    } else if (b === 'jhajjar' || src.includes('jhajjar')) {
        plantSubtitle = 'JK SUPER CEMENT DEPO — JHAJJAR';
    } else if (b === 'bahadurgarh' || src.includes('bahadurgarh')) {
        plantSubtitle = 'JK SUPER CEMENT DEPO — BAHADURGARH';
    }

    // Header
    y += 10;
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text('VIKAS GOODS TRANSPORT CO.', M, y, { align: 'center', width: CW });
    y += 18;
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text(plantSubtitle, M, y, { align: 'center', width: CW });
    y += 13;
    doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text('Metro Market, Behind SBI Bank, Jhamri Mod, Jharli, Jhajjar | Mob: 9416319445, 9728954901 | GSTIN: 06ARIPK9021C2Z2', M, y, { align: 'center', width: CW });
    y += 12;
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#000').lineWidth(1).stroke();
    y += 8;

    // LR Badge
    const lrBadge = `LOADING RECEIPT # ${data.lrNo || '—'}`;
    const badgeW = Math.min(doc.widthOfString(lrBadge) + 24, CW - 40);
    doc.rect((PW - badgeW) / 2, y, badgeW, 20).fillAndStroke('#000', '#000');
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#fff').text(lrBadge, M, y + 4.5, { align: 'center', width: CW });
    y += 28;

    // Info Grid
    const drawRow = (lbl1, val1, lbl2, val2) => {
        const colW = CW / 2;
        doc.rect(M, y, colW, 20).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.rect(M + colW, y, colW, 20).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text(lbl1.toUpperCase(), M + 8, y + 3);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(String(val1 || '—'), M + 8, y + 10, { width: colW - 16, ellipsis: true });

        if (lbl2) {
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text(lbl2.toUpperCase(), M + colW + 8, y + 3);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(String(val2 || '—'), M + colW + 8, y + 10, { width: colW - 16, ellipsis: true });
        }
        y += 20;
    };

    drawRow('Date', data.date || new Date().toLocaleDateString('en-IN'), 'Truck Number', (data.truckNo || '—').toUpperCase());
    drawRow('Party / Consignee', data.partyName || '—', 'Destination', data.destination || '—');
    drawRow('Driver Name', data.driverName || '—', 'Challan Nos.', data.billing && data.billing !== 'No' ? data.billing : '—');
    y += 10;

    // Material Table
    const colW1 = CW * 0.36; // Material
    const colW2 = CW * 0.24; // Type
    const colW3 = CW * 0.18; // Bags
    const colW4 = CW * 0.22; // Weight
    const x0 = M, x1 = x0 + colW1, x2 = x1 + colW2, x3 = x2 + colW3, x4 = x3 + colW4;

    // Table Header
    doc.rect(M, y, CW, 18).fill('#1e293b');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.text('MATERIAL', x0 + 6, y + 5);
    doc.text('LOADING TYPE', x1 + 6, y + 5);
    doc.text('BAGS', x2 + 6, y + 5, { width: colW3 - 12, align: 'right' });
    doc.text('WEIGHT (MT)', x3 + 6, y + 5, { width: colW4 - 12, align: 'right' });
    y += 18;

    // Table Rows
    materials.forEach((m, idx) => {
        const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        doc.rect(M, y, CW, 20).fillAndStroke(bg, '#cbd5e1');
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000').text(m.type || m.material || 'Cement', x0 + 6, y + 5);
        doc.fontSize(8).font('Helvetica').fillColor('#334155').text(m.loadingType || data.loadingType || 'From Godown', x1 + 6, y + 5);
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000').text(String(m.bags || m.totalBags || 0), x2 + 6, y + 5, { width: colW3 - 12, align: 'right' });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000').text(`${parseFloat(m.weight || 0).toFixed(2)} MT`, x3 + 6, y + 5, { width: colW4 - 12, align: 'right' });
        y += 20;
    });

    // Total Row
    doc.rect(M, y, CW, 22).fillAndStroke('#0f172a', '#0f172a');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    doc.text('TOTAL QUANTITY:', x0 + 6, y + 6);
    doc.text(`${totalBags} Bags`, x2 + 6, y + 6, { width: colW3 - 12, align: 'right' });
    doc.text(`${totalWeight.toFixed(2)} MT`, x3 + 6, y + 6, { width: colW4 - 12, align: 'right' });
    y += 32;

    // Terms / declaration
    doc.fontSize(7).font('Helvetica').fillColor('#64748b').text('• Material received in sound condition. Subject to Jhajjar jurisdiction only.', M + 8, y);
    y += 18;

    // Signatures
    const sigY = PH - M - 60;
    const sigW = (CW - 20) / 3;
    const sigs = ['Driver Signature', 'Receiver / Munshi', 'Authorized Signatory (VGTC)'];
    sigs.forEach((lbl, i) => {
        const sx = M + i * (sigW + 10);
        doc.rect(sx, sigY, sigW, 42).strokeColor('#94a3b8').lineWidth(0.5).stroke();
        doc.moveTo(sx + 8, sigY + 28).lineTo(sx + sigW - 8, sigY + 28).strokeColor('#cbd5e1').stroke();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#334155').text(lbl, sx, sigY + 31, { width: sigW, align: 'center' });
    });

    // Footer
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8').text(`VGTC Smart Logistics Portal • Backed up on ${new Date().toLocaleString('en-IN')}`, M, PH - M - 12, { align: 'center', width: CW });
}

async function generateLoadingReceiptPDF(data, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 24, size: 'A5' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        buildLoadingReceiptPdf(data, doc);
        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

async function generateLoadingReceiptPDFBuffer(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 24, size: 'A5' });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        buildLoadingReceiptPdf(data, doc);
        doc.end();
    });
}

/**
 * Generates a detailed landscape A4 voucher list PDF for the weekly backup report.
 * Shows all balance-sheet columns: LR No, Date, Truck, Dest, Weight, Rate,
 * Gross, Diesel, Cash, Online, Munshi, Net, Paid, Due, Status.
 */
async function generateVoucherListPDF(plantName, vouchers, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 20, size: 'A4', layout: 'landscape' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        const PW = doc.page.width;
        const M = 20;

        // ── Header bar ───────────────────────────────────────────
        doc.rect(M, M, PW - M * 2, 36).fill('#1e293b');
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#fff')
            .text(`VIKAS GOODS TRANSPORT — ${plantName} Voucher Report`, M + 10, M + 8);
        doc.fontSize(9).fillColor('#94a3b8')
            .text(`Generated: ${new Date().toLocaleString('en-IN')} | Total: ${vouchers.length} entries`, M + 10, M + 24);
        let vy = M + 46;

        // ── Column definitions ────────────────────────────────────
        const cols = [
            { label: 'LR No.',      w: 42 },
            { label: 'Date',        w: 52 },
            { label: 'Truck',       w: 52 },
            { label: 'Destination', w: 70 },
            { label: 'Wt(MT)',      w: 38 },
            { label: 'Rate',        w: 38 },
            { label: 'Gross(Rs)',   w: 52 },
            { label: 'Diesel',      w: 45 },
            { label: 'Cash',        w: 40 },
            { label: 'Online',      w: 40 },
            { label: 'Munshi',      w: 40 },
            { label: 'Net(Rs)',     w: 52 },
            { label: 'Paid(Rs)',    w: 46 },
            { label: 'Due(Rs)',     w: 46 },
            { label: 'Status',      w: 48 },
        ];

        const ROW_H = 16;

        const drawHeaderRow = (startY) => {
            doc.rect(M, startY, PW - M * 2, ROW_H).fill('#f1f5f9');
            let hx = M;
            cols.forEach(c => {
                doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569')
                    .text(c.label, hx + 2, startY + 4, { width: c.w - 4, ellipsis: true });
                hx += c.w;
            });
            return startY + ROW_H;
        };

        vy = drawHeaderRow(vy);

        // ── Data rows ─────────────────────────────────────────────
        vouchers.forEach((v, idx) => {
            const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
            const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
            const diesel = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
            const cash   = parseFloat(v.advanceCash)   || 0;
            const online = parseFloat(v.advanceOnline) || 0;
            const munshi = parseFloat(v.munshi)        || 0;
            const net    = gross - diesel - cash - online - munshi;
            const paid   = parseFloat(v.paidBalance)   || 0;
            const due    = Math.max(0, net - paid);
            const cleared = due <= 0;

            if (vy + ROW_H > doc.page.height - 30) {
                doc.addPage();
                vy = M;
                vy = drawHeaderRow(vy);
            }

            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(M, vy, PW - M * 2, ROW_H).fill(rowBg);

            const cells = [
                `#${v.lrNo || '—'}`,
                v.date || '—',
                v.truckNo || '—',
                (v.destination || '—').slice(0, 14),
                v.weight ? String(v.weight) : '—',
                v.rate   ? String(v.rate)   : '—',
                Math.round(gross).toLocaleString(),
                dieselPending ? 'FULL' : (diesel > 0 ? diesel.toLocaleString() : '—'),
                cash   > 0 ? cash.toLocaleString()   : '—',
                online > 0 ? online.toLocaleString() : '—',
                munshi > 0 ? munshi.toLocaleString() : '—',
                Math.round(net).toLocaleString(),
                paid   > 0 ? paid.toLocaleString()   : '—',
                due    > 0 ? due.toLocaleString()    : '—',
                cleared ? 'Cleared' : 'Pending',
            ];

            let cx = M;
            cells.forEach((val, ci) => {
                const isStatus = ci === cols.length - 1;
                const color = isStatus
                    ? (cleared ? '#059669' : '#dc2626')
                    : (ci >= 6 ? '#1e293b' : '#334155');
                doc.fontSize(7).font(ci >= 6 ? 'Helvetica-Bold' : 'Helvetica')
                    .fillColor(color)
                    .text(String(val), cx + 2, vy + 4, { width: cols[ci].w - 4, ellipsis: true });
                cx += cols[ci].w;
            });

            doc.moveTo(M, vy + ROW_H).lineTo(PW - M, vy + ROW_H)
                .strokeColor('#e2e8f0').lineWidth(0.3).stroke();
            vy += ROW_H;
        });

        // ── Summary footer ────────────────────────────────────────
        const totalGross = vouchers.reduce((s, v) => s + (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0), 0);
        const totalPaid  = vouchers.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
        vy += 4;
        doc.rect(M, vy, PW - M * 2, 20).fill('#1e293b');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
            .text(
                `Total Entries: ${vouchers.length}   |   Gross Total: Rs.${Math.round(totalGross).toLocaleString()}   |   Total Paid: Rs.${Math.round(totalPaid).toLocaleString()}`,
                M + 10, vy + 6
            );

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

/**
 * Generates a formal Transportation Freight Bill / Tax Invoice PDF.
 * Dynamically fits rows — no fixed per-page limit. Adds pages as needed.
 * Includes amount in words, GST, signature, declaration.
 */
async function generateInvoicePDF(invoiceData, outputPath) {
    const { VGTC_INFO, PLANT_CONFIGS } = require('../config/plantConfig');
    const {
        plantKey = 'jksuper_jharli',
        billNo = '',
        billDate = '',
        items = [],
        gstRate: gstRateOverride,
    } = invoiceData;

    const plant = PLANT_CONFIGS[plantKey] || PLANT_CONFIGS.jksuper_jharli;
    const co = VGTC_INFO;

    // GST rate: override > plant config > default 6
    const gstRate = gstRateOverride || plant.gstRate || 6;
    const igstRate = gstRate * 2;

    // Auto-derive financial year from billDate
    const getFY = (dateStr) => {
        let d;
        if (dateStr && dateStr.includes('-')) d = new Date(dateStr);
        else if (dateStr && dateStr.includes('.')) {
            const [dd, mm, yy] = dateStr.split('.');
            d = new Date(`${yy}-${mm}-${dd}`);
        } else d = new Date();
        if (isNaN(d.getTime())) d = new Date();
        const yr = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
        return `${yr}-${String(yr + 1).slice(2)}`;
    };
    const financialYear = getFY(billDate);

    // Auto-calculate totals per item
    const enriched = items.map(it => {
        const billed = parseFloat(it.billedQty) || 0;
        const rec = parseFloat(it.recQty) || 0;
        const rate = parseFloat(it.ratePMT) || 0;
        const short = parseFloat(it.shortQty) || 0;
        const freight = billed * rate;
        return { ...it, billed, rec, rate, short, freight };
    });

    const grandBilled = enriched.reduce((s, v) => s + v.billed, 0);
    const grandRec = enriched.reduce((s, v) => s + v.rec, 0);
    const grandFreight = enriched.reduce((s, v) => s + v.freight, 0);
    const grandShort = enriched.reduce((s, v) => s + v.short, 0);
    const cgst = parseFloat((grandFreight * gstRate / 100).toFixed(2));
    const sgst = parseFloat((grandFreight * gstRate / 100).toFixed(2));
    const grandTotal = parseFloat((grandFreight + cgst + sgst).toFixed(2));

    // Indian number format
    const fmtNum = (n) => {
        if (n === 0) return '0';
        return Math.abs(n).toLocaleString('en-IN') * (n < 0 ? -1 : 1) || n.toLocaleString('en-IN');
    };
    const fmtD2 = (n) => {
        const fixed = Math.abs(n).toFixed(2);
        const [int, dec] = fixed.split('.');
        return (n < 0 ? '-' : '') + parseInt(int).toLocaleString('en-IN') + '.' + dec;
    };
    const fmtD3 = (n) => {
        const fixed = Math.abs(n).toFixed(3);
        const [int, dec] = fixed.split('.');
        return (n < 0 ? '-' : '') + parseInt(int).toLocaleString('en-IN') + '.' + dec;
    };

    // Amount in words
    const numberToWords = (num) => {
        const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
            'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
        const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
        if (num === 0) return 'ZERO';
        const convert = (n) => {
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
            if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + convert(n % 100) : '');
            if (n < 100000) return convert(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + convert(n % 1000) : '');
            if (n < 10000000) return convert(Math.floor(n / 100000)) + ' LAKH' + (n % 100000 ? ' ' + convert(n % 100000) : '');
            return convert(Math.floor(n / 10000000)) + ' CRORE' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
        };
        const rupees = Math.floor(Math.abs(num));
        const paise = Math.round((Math.abs(num) - rupees) * 100);
        let words = convert(rupees) + ' RUPEES';
        if (paise > 0) words += ' AND ' + convert(paise) + ' PAISE';
        return words + ' ONLY';
    };

    // Landscape A4 — spacious rows, header+footer on every page
    const ROW_H = 20;
    const TOTAL_ROW_H = 14;
    const HEADER_HEIGHT = 195;
    const FOOTER_HEIGHT = 150;

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 12, size: 'A4', layout: 'landscape' });
        let stream, chunks;
        if (outputPath) {
            stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);
        } else {
            chunks = [];
            doc.on('data', c => chunks.push(c));
        }

        const PW = doc.page.width;
        const PH = doc.page.height;
        const M = 12;
        const W = PW - M * 2;

        // ── Helper: draw bordered cell ──
        function cell(x, y, w, h, text, opts = {}) {
            const { bg, align = 'left', font = 'Helvetica-BoldOblique', size = 9, color = '#000', noBorderLeft, noBorderRight, noBorderTop, noBorderBottom, padding = 3, clip } = opts;
            if (bg) doc.save().rect(x, y, w, h).fill(bg).restore();
            doc.save();
            doc.lineWidth(0.5);
            if (!noBorderTop) doc.moveTo(x, y).lineTo(x + w, y).stroke('#000');
            if (!noBorderBottom) doc.moveTo(x, y + h).lineTo(x + w, y + h).stroke('#000');
            if (!noBorderLeft) doc.moveTo(x, y).lineTo(x, y + h).stroke('#000');
            if (!noBorderRight) doc.moveTo(x + w, y).lineTo(x + w, y + h).stroke('#000');
            doc.restore();
            if (text !== undefined && text !== null && String(text).length > 0) {
                doc.save();
                if (clip) doc.rect(x, y, w, h).clip();
                doc.font(font).fontSize(size).fillColor(color);
                const tw = w - padding * 2;
                doc.text(String(text), x + padding, y + padding, { width: tw, height: h - padding, align, lineBreak: !clip, ellipsis: clip });
                doc.restore();
            }
        }

        // Column widths — landscape gives ~820pt usable width
        const colPcts = [3, 18, 11, 8, 8, 8, 8, 6.5, 6.5, 4.5, 7, 3.5];
        const cols = colPcts.map(p => Math.round(W * p / 100));
        cols[cols.length - 1] += W - cols.reduce((s, c) => s + c, 0);
        function colX(idx) { return M + cols.slice(0, idx).reduce((s, c) => s + c, 0); }

        // Single page per invoice — all entries on one page
        // Row height auto-adjusts if many entries to fit on one page
        const maxRowsAtCurrentSize = Math.floor((PH - M * 2 - HEADER_HEIGHT - FOOTER_HEIGHT - TOTAL_ROW_H) / ROW_H);
        const actualRowH = enriched.length > maxRowsAtCurrentSize
            ? Math.floor((PH - M * 2 - HEADER_HEIGHT - FOOTER_HEIGHT - TOTAL_ROW_H) / enriched.length)
            : ROW_H;
        const pages = [enriched]; // always single page

        // ══════════════════════════════════════════════════════════
        function drawPage(pageItems, pageIdx, isLastPage) {
            if (pageIdx > 0) doc.addPage();
            let y = M;

            // ── Header Section ──
            const halfW = Math.round(W / 2);
            const qW = Math.round(W / 4);
            const dh = 14;

            // Company name
            cell(M, y, W, 18, co.company, { align: 'center', font: 'Helvetica-Bold', size: 13, noBorderLeft: true, noBorderRight: true, noBorderTop: true, padding: 3 });
            y += 18;
            // Address
            cell(M, y, W, 13, `${co.address} ,E-Mail : ${co.email},Contact : ${co.contact}`, { align: 'center', size: 8, noBorderLeft: true, noBorderRight: true, padding: 2 });
            y += 13;
            // Yellow banner
            cell(M, y, W, 14, 'TRANSPORTATION FREIGHT BILL ( Primary/Grey)', { bg: '#ffff00', align: 'center', size: 10, noBorderLeft: true, noBorderRight: true, padding: 2 });
            y += 14;
            // Tax Invoice
            cell(M, y, W, 14, 'TAX INVOICE (Loose/Bag/STO) - Cement/Clinker', { align: 'center', size: 10, noBorderLeft: true, noBorderRight: true, padding: 2 });
            y += 14;

            // Details grid
            function detailRow(yy, ll, lv, rl, rv) {
                cell(M, yy, qW, dh, ll, { size: 9, noBorderLeft: true });
                cell(M + qW, yy, qW, dh, lv, { size: 9 });
                if (rl !== null) {
                    cell(M + halfW, yy, qW, dh, rl, { size: 9 });
                    cell(M + halfW + qW, yy, qW, dh, rv, { size: 9, noBorderRight: true });
                } else {
                    cell(M + halfW, yy, halfW, dh, '', { noBorderRight: true });
                }
            }
            detailRow(y, 'Sap Code :', plant.sapCode, 'Bill No. :', billNo); y += dh;
            detailRow(y, 'Consignor / Bill To', plant.consignor, 'Date :', billDate); y += dh;
            detailRow(y, 'GSTI :', plant.consignorGSTIN, 'PAN No.:', co.pan); y += dh;
            detailRow(y, 'SAC Code :', co.sacCode, 'GSTIN No.:', co.gstin); y += dh;
            detailRow(y, 'Plant Code :', plant.plantCode, 'Status', plant.status || 'Propriter'); y += dh;
            cell(M, y, halfW, dh, '', { noBorderLeft: true, noBorderTop: true, noBorderBottom: true });
            cell(M + halfW, y, qW, dh, 'Transport Mode', { size: 9 });
            cell(M + halfW + qW, y, qW, dh, co.transportMode, { size: 9, noBorderRight: true }); y += dh;
            cell(M, y, halfW, dh, '', { noBorderLeft: true, noBorderTop: true, noBorderBottom: true });
            cell(M + halfW, y, qW, dh, 'RST on forward Charge', { size: 9 });
            cell(M + halfW + qW, y, qW, dh, co.rstForwardCharge, { size: 9, noBorderRight: true }); y += dh;
            cell(M, y, qW, dh, 'Place of Supply', { align: 'center', size: 9, noBorderLeft: true });
            cell(M + qW, y, qW, dh, 'State Name', { align: 'center', size: 9 });
            cell(M + halfW, y, qW, dh, 'State Code', { size: 9 });
            cell(M + halfW + qW, y, qW, dh, plant.stateCode, { size: 9, noBorderRight: true }); y += dh;

            // ── Table Header ──
            const th = 20;
            const hdrs = ['S NO', 'Consignee Name', 'Destination', 'Truck No', 'LR No', 'InvoiceNo', 'Invoice Date', 'Billed Qty (LD)', 'Rec. Qty\n(UL)', 'Rate\nPMT', 'Total Freight', 'Short\nQty'];
            for (let i = 0; i < hdrs.length; i++) {
                cell(colX(i), y, cols[i], th, hdrs[i], {
                    bg: '#eaedf2', align: 'center', size: 7, padding: 2,
                    noBorderLeft: i === 0, noBorderRight: i === hdrs.length - 1,
                });
            }
            y += th;

            // ── Data Rows — full size, no clipping ──
            const startNum = pages.slice(0, pageIdx).reduce((s, p) => s + p.length, 0);
            for (let r = 0; r < pageItems.length; r++) {
                const it = pageItems[r];
                const vals = [
                    startNum + r + 1, it.consigneeName || '', it.destination || '',
                    it.truckNo || '', it.lrNo || '', it.invoiceNo || '', it.invoiceDate || '',
                    it.billed, it.rec, it.rate, it.freight, it.short || ''
                ];
                const aligns = ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'right', 'center'];
                const rh = actualRowH || ROW_H;
                const rFont = rh < 16 ? 7 : rh < 18 ? 8 : 9;
                const rPad = rh < 16 ? 2 : rh < 18 ? 3 : 4;
                for (let c = 0; c < vals.length; c++) {
                    cell(colX(c), y, cols[c], rh, vals[c], {
                        align: aligns[c], size: rFont, clip: true, padding: rPad,
                        noBorderLeft: c === 0, noBorderRight: c === vals.length - 1,
                    });
                }
                y += rh;
            }

            // ── Grand Total ──
            const mergedW = cols.slice(0, 7).reduce((s, c) => s + c, 0);
            cell(colX(0), y, mergedW, TOTAL_ROW_H, '', { noBorderLeft: true });
            const totVals = [fmtD3(grandBilled), fmtD3(grandRec), '', fmtD2(grandFreight), fmtD3(grandShort)];
            for (let c = 7; c < cols.length; c++) {
                cell(colX(c), y, cols[c], TOTAL_ROW_H, totVals[c - 7], {
                    align: 'right', size: 8, padding: 3, noBorderRight: c === cols.length - 1,
                });
            }
            y += TOTAL_ROW_H;

            // ── Footer — only on last page ──
            if (isLastPage) {
                // GST section: 3 columns — Label | Tag | Amount
                const gstX = colX(8);
                const gC1 = cols[8];            // label: "Inter State" / "Intra State"
                const gC2 = cols[9];            // tag: "IGST 18%"
                const gC3 = cols[10] + cols[11]; // amount (wide enough for totals)
                const gstH = 13;

                cell(gstX, y, gC1, gstH, 'Inter State', { size: 8, padding: 3 });
                cell(gstX + gC1, y, gC2, gstH, `IGST ${igstRate}%`, { size: 7, padding: 2 });
                cell(gstX + gC1 + gC2, y, gC3, gstH, '0', { align: 'right', size: 8, padding: 2 }); y += gstH;

                cell(gstX, y, gC1, gstH, 'Intra State', { size: 8, padding: 3, noBorderBottom: true });
                cell(gstX + gC1, y, gC2, gstH, `CGST ${gstRate}%`, { size: 7, padding: 2 });
                cell(gstX + gC1 + gC2, y, gC3, gstH, fmtD2(cgst), { align: 'right', size: 7, padding: 2 }); y += gstH;

                cell(gstX, y, gC1, gstH, '', { noBorderTop: true });
                cell(gstX + gC1, y, gC2, gstH, `SGST ${gstRate}%`, { size: 7, padding: 2 });
                cell(gstX + gC1 + gC2, y, gC3, gstH, fmtD2(sgst), { align: 'right', size: 7, padding: 2 }); y += gstH;

                cell(gstX, y, gC1 + gC2, gstH, 'Total', { size: 9, padding: 3 });
                cell(gstX + gC1 + gC2, y, gC3, gstH, fmtD2(grandTotal), { align: 'right', font: 'Helvetica-Bold', size: 7, padding: 2 }); y += gstH;

                // Amount in words
                y += 2;
                const wordsText = `Total Amount in words -  ${numberToWords(grandTotal)}`;
                cell(M, y, W, 15, wordsText, { font: 'Helvetica-Bold', size: 8, noBorderLeft: true, noBorderRight: true, padding: 3 }); y += 15;

                // Signature
                const sigX = colX(8);
                const sigW = cols.slice(8).reduce((s, c) => s + c, 0);
                cell(sigX, y, sigW, 14, `For ${co.company}`, { align: 'right', size: 8, noBorderRight: true, padding: 3 }); y += 14;
                cell(sigX, y, sigW, 28, '', { noBorderRight: true });
                doc.font('Helvetica-BoldOblique').fontSize(8).fillColor('#000')
                    .text('Autorised Signatory', sigX, y + 18, { width: sigW, align: 'right' }); y += 28;

                // Declaration
                y += 2;
                const declText = `"I/we have taken registration under the CGST Act, 2017 and have exercised the option to pay tax on services of GTA in relation to transport of goods supplied by us during the Financial Year ${financialYear} under forward charge.".\nGTA in relation to transport of goods supplied by us during the Financial Year ${financialYear} under forward charge.".`;
                cell(M, y, W * 0.04, 30, `${igstRate}%\n(FCM)`, { align: 'center', size: 6, noBorderLeft: true, noBorderBottom: true, padding: 1 });
                cell(M + W * 0.04, y, W * 0.11, 30, 'Decelaration -', { align: 'center', size: 8, noBorderBottom: true, padding: 3 });
                cell(M + W * 0.15, y, W * 0.85, 30, declText, { align: 'center', size: 6, noBorderRight: true, noBorderBottom: true, padding: 3 });
            }
        }

        // Render
        for (let p = 0; p < pages.length; p++) {
            drawPage(pages[p], p, p === pages.length - 1);
        }

        doc.end();
        if (outputPath) {
            stream.on('finish', () => resolve(outputPath));
            stream.on('error', reject);
        } else {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
        }
    });
}

function buildSaleDoc(s, doc) {
    const PW = doc.page.width;
    const M = 40;

    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1e293b').text('VIKAS GOODS TRANSPORT CO.', M, M, { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Cement Sales Receipt / Voucher', M, M + 22, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(M, doc.y).lineTo(PW - M, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.moveDown(1);

    const drawRow = (label, value) => {
        const currentY = doc.y;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text(label.toUpperCase(), M, currentY);
        doc.fontSize(11).font('Helvetica').fillColor('#1e293b').text(String(value || '—'), M + 120, currentY);
        doc.moveDown(0.8);
        doc.moveTo(M, doc.y).lineTo(PW - M, doc.y).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        doc.moveDown(0.5);
    };

    drawRow('Date', s.date || new Date().toLocaleDateString('en-IN'));
    drawRow('Customer', s.customerName || 'Walk-in');
    drawRow('Material', s.material || '—');
    drawRow('Quantity', `${s.quantity} Bags (${(s.quantity * 0.05).toFixed(2)} MT)`);
    drawRow('Rate', `Rs. ${s.rate || 0}`);
    drawRow('Payment', s.paymentStatus === 'pending' ? 'Not Paid (Pending)' : (s.paymentType || 'CASH').toUpperCase());

    doc.moveDown(1);
    doc.rect(M, doc.y, PW - M * 2, 40).fill('#f8fafc');
    doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold').text('TOTAL AMOUNT', M + 10, doc.y + 13);
    doc.text(`Rs. ${(s.totalAmount || 0).toLocaleString('en-IN')}`, M, doc.y - 14, { align: 'right', width: PW - M * 2 - 10 });
    
    doc.moveDown(2);
    
    // Status Stamp
    const isPending = s.paymentStatus === 'pending';
    doc.save();
    doc.rotate(-5, { origin: [PW - M - 60, doc.y + 10] });
    doc.rect(PW - M - 140, doc.y, 140, 25).lineWidth(2).strokeColor(isPending ? '#f43f5e' : '#10b981').stroke();
    doc.fontSize(10).font('Helvetica-Bold').fillColor(isPending ? '#f43f5e' : '#10b981')
        .text(isPending ? 'NOT PAID' : `PAID - ${(s.paymentType || 'CASH').toUpperCase()}`, PW - M - 140, doc.y + 7, { width: 140, align: 'center' });
    doc.restore();

    doc.fontSize(8).fillColor('#94a3b8').text(`Generated on ${new Date().toLocaleString('en-IN')} • VGTC Portal`, M, doc.page.height - 50, { align: 'center' });
}

/**
 * Generates a Sale Receipt PDF that mimics the SellModule print format.
 */
async function generateSalePDF(s, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A5' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        buildSaleDoc(s, doc);
        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

/**
 * Generates a Sale Receipt PDF Buffer in-memory.
 */
async function generateSalePDFBuffer(s) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A5' });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        buildSaleDoc(s, doc);
        doc.end();
    });
}

module.exports = {
    generateModuleReport,
    generateReceiptPDF,
    generateVoucherPDF,
    generateVoucherPDFBuffer,
    generateLoadingReceiptPDF,
    generateLoadingReceiptPDFBuffer,
    generateVoucherListPDF,
    generateInvoicePDF,
    generateSalePDF,
    generateSalePDFBuffer,
};
