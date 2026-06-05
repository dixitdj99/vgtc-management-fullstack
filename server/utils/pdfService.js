const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');

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
async function generateVoucherPDF(v, outputPath) {
    const isBill = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill';

    // Support multi-delivery vouchers (deliveries array)
    const gross = v.deliveries?.length > 0
        ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
        : (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);

    const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
    const diesel   = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
    const cash     = parseFloat(v.advanceCash) || 0;
    const online   = parseFloat(v.advanceOnline) || 0;
    const weight   = parseFloat(v.weight) || 0;
    const munshi   = parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
    const shortage  = parseFloat(v.shortage) || 0;
    const commission = parseFloat(v.commission) || 0;
    const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
    const tyreGreasing = (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0);
    const extraCash  = parseFloat(v.extraCash) || 0;
    const totalDeductions = diesel + cash + online + munshi + shortage + commission + tyrePuncture + tyreGreasing + extraCash;
    const net = gross - totalDeductions;

    // Match exact same deduction list as browser printVoucher function
    const deductions = [
        { label: 'Diesel Advance',    value: diesel,    isPending: dieselPending },
        { label: 'Cash Advance',      value: cash },
        { label: 'Online Advance',    value: online },
        { label: 'Munshi',            value: munshi },
        { label: 'Shortage',          value: shortage },
        { label: 'Commission',        value: commission },
        { label: 'Tyre Puncture',     value: tyrePuncture },
        { label: 'Tyre Greasing & Air', value: tyreGreasing },
        { label: `Extra Cash${v.extraCashRemark ? ' (' + v.extraCashRemark + ')' : ''}`, value: extraCash },
    ].filter(d => d.value > 0 || d.isPending);

    return new Promise((resolve, reject) => {
        if (isBill) {
            const doc = new PDFDocument({ margin: 20, size: 'A5', layout: 'landscape' });
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // A5 landscape: width = 595.28, height = 419.53
            const PW = 595.28;
            const PH = 419.53;
            const M = 15;

            doc.rect(M, M, PW - M * 2, PH - M * 2).strokeColor('#000').lineWidth(1).stroke();
            
            let y = M + 5;
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text('M/S. VIKAS GOODS TRANSPORT CO.', M, y, { align: 'center' });
            y += 20;
            
            doc.rect(M + (PW - M * 2) / 2 - 100, y, 200, 14).fillAndStroke('#000', '#000');
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff').text('Authorised Transport for : J.K. Super Cement Ltd.', M, y + 3, { align: 'center' });
            y += 18;
            
            doc.fillColor('#000').fontSize(8).font('Helvetica-Bold').text('Near Gaushala, Rewari Road, Jhajjar (Hr.)', M, y, { align: 'center' });
            y += 10;
            doc.text('Mob. : 9728284849, 9416319445', M, y, { align: 'center' });
            y += 10;
            doc.fontSize(7).font('Helvetica').text('Head Office : Near Rao Gopal Dev Chowk, Narnaul Road, Rewari', M, y, { align: 'center' });
            doc.fontSize(7).font('Helvetica-Bold').text('GSTIN : 06ARIPK9021C2Z2', PW - M - 100, M + 10);
            
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
            doc.text(v.type === 'Kosli_Bill' ? 'Kosli' : 'Jhajjar', M + 5, y + 35, { align: 'center', width: col1 - M });
            
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
            doc.text(`From : ${v.type === 'Kosli_Bill' ? 'Kosli' : 'Jhajjar'}`, col2 + 5, y + 18);
            doc.moveTo(col2, y + 30).lineTo(PW - M, y + 30).stroke();
            doc.text(`To  ${v.destination || ''}`, col2 + 50, y + 18);
            doc.text(`LR No. ${v.lrNo || ''}`, col2 + 5, y + 35);
            doc.font('Helvetica').text(`Date: ${v.date}`, col2 + 100, y + 35);
            
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
            
            doc.moveTo(cwX[0], descY + 45).lineTo(cwX[1], descY + 45).stroke();
            doc.fontSize(7).text(`Bill No. : ${v.billNo || 'N/A'}`, cwX[0] + 5, descY + 50);
            doc.text('Value of Goods:', cwX[0] + 5, descY + 60);
            doc.text('Shipment No. :', cwX[0] + 5, descY + 70);
            doc.text('D.I. No.', cwX[0] + 5, descY + 80);
            
            doc.fontSize(9).text(v.weight ? v.weight + ' MT' : '', cwX[1] + 5, y + 10, { width: cw3 - 10, align: 'center' });
            doc.fontSize(8).text(v.rate || '', cwX[2] + 5, y + 10, { width: cw4 - 10, align: 'center' });
            
            doc.fontSize(8).font('Helvetica-Bold').text(`Advance = \n${dieselPending ? 'FULL (Pending)' : (!totalDeductions ? '—' : 'Rs.' + Math.round(totalDeductions).toLocaleString())}`, cwX[3] + 5, y + 30, { width: cw5*2 - 10, align: 'center' });
            doc.fontSize(10).text(`To be Billed\n\n${dieselPending ? '—' : 'Rs.' + Math.round(net).toLocaleString()}`, cwX[5] + 5, y + 20, { width: cw7 - 10, align: 'center' });
            doc.fontSize(7).font('Helvetica').text(`Driver Name\nD.L. No.\nOwner Permit No.\nPermit No.\nAddress\n\n${getPumpDisplay(v.pump) !== '—' ? 'Pump: ' + getPumpDisplay(v.pump) : ''}`, cwX[6] + 5, y + 5);
            
            y = PH - M - 40;
            doc.moveTo(M, y).lineTo(PW - M, y).stroke();
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Total', M + 5, y + 3, { width: cw1 + cw2 - 10, align: 'center' });
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
            
            doc.end();
            stream.on('finish', () => resolve(outputPath));
            stream.on('error', reject);
            return;
        }

        const doc = new PDFDocument({ margin: 30, size: 'A6' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        const PW = doc.page.width, M = 30, CW = PW - M * 2;
        let y = M;

        // Header — matches browser print
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text('Vikas Goods Transport Company', M, y, { align: 'center', width: CW });
        y += 16;
        doc.fontSize(10).font('Helvetica-Bold').text('Voucher', M, y, { align: 'center', width: CW });
        y += 12;
        doc.fontSize(8).font('Helvetica').text('VGTC, Metro Market, Behind SBI Bank, Jhamri Mod, Jharli, Jhajjar', M, y, { align: 'center', width: CW });
        y += 12;
        doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#000').lineWidth(1.5).stroke();
        y += 10;

        // LR badge — show all delivery LRs if multi-delivery
        const hasDeliveries = v.deliveries && v.deliveries.length > 0;
        const lrDisplay = hasDeliveries
            ? `LRs: ${v.deliveries.map(d => d.lrNo).filter(Boolean).join(', ')}`
            : `LR # ${v.lrNo}`;
        const bw = Math.min(doc.widthOfString(lrDisplay) + 20, CW);
        doc.rect((PW - bw) / 2, y, bw, 18).strokeColor('#000').lineWidth(1.5).stroke();
        doc.fontSize(hasDeliveries ? 8 : 12).font('Helvetica-Bold').text(lrDisplay, M, y + (hasDeliveries ? 5 : 4), { align: 'center', width: CW });
        y += 22;
        doc.fontSize(8).font('Helvetica').fillColor('#000').text(v.type ? v.type.replace(/_/g, ' ') : '', M, y, { align: 'center', width: CW });
        y += 14;

        // Info rows
        const drawInfoRow = (label, value) => {
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(label.toUpperCase(), M, y);
            doc.font('Helvetica').text(String(value || '—'), M + CW * 0.4, y, { width: CW * 0.6, align: 'right' });
            y += 14;
            doc.moveTo(M, y - 2).lineTo(PW - M, y - 2).strokeColor('#000').lineWidth(0.3).stroke();
        };
        drawInfoRow('Date', v.date);
        drawInfoRow('Truck No.', v.truckNo);

        if (hasDeliveries) {
            // Multi-delivery: show each destination inline
            v.deliveries.forEach(d => {
                drawInfoRow(`${d.lrNo ? '#'+d.lrNo+' ' : ''}Dest`, `${d.destination || '—'} ${d.partyName ? '('+d.partyName+')' : ''}`);
            });
        } else {
            drawInfoRow('Destination', v.destination || '—');
        }
        y += 4;

        // Data grid — show totals
        const totalWeight = hasDeliveries
            ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0)
            : (parseFloat(v.weight) || 0);
        const totalBags = hasDeliveries
            ? v.deliveries.reduce((s, d) => s + (parseInt(d.bags) || 0), 0)
            : (parseInt(v.bags) || 0);

        const CELLW = (CW - 4) / 2, CELLH = 28;
        const drawCell = (label, value, cx, cy) => {
            doc.rect(cx, cy, CELLW, CELLH).strokeColor('#000').lineWidth(0.5).stroke();
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text(label.toUpperCase(), cx + 6, cy + 4);
            doc.fontSize(11).font('Helvetica-Bold').text(String(value || '—'), cx + 6, cy + 14);
        };
        drawCell('Weight', `${totalWeight.toFixed(2)} MT`, M, y);
        drawCell('Bags', String(totalBags), M + CELLW + 4, y);
        y += CELLH + 4;
        if (!hasDeliveries) {
            drawCell('Rate', `Rs.${v.rate}/MT`, M, y);
            drawCell('Pump', getPumpDisplay(v.pump), M + CELLW + 4, y);
            y += CELLH + 8;
        } else {
            drawCell('Pump', getPumpDisplay(v.pump), M, y);
            drawCell('Gross', `Rs.${Math.round(gross).toLocaleString()}`, M + CELLW + 4, y);
            y += CELLH + 8;
        }

        // Calc box
        doc.rect(M, y, CW, 16).fill('#e8e8e8');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text('PAYMENT CALCULATION', M + 6, y + 4);
        y += 18;

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Gross Total', M + 6, y);
        doc.text(`Rs.${Math.round(gross).toLocaleString()}`, M + 6, y, { width: CW - 12, align: 'right' });
        y += 14;
        const grossDetail = hasDeliveries
            ? `${v.deliveries.length} destinations`
            : `${v.weight} MT x Rs.${v.rate}/MT`;
        doc.fontSize(7).font('Helvetica').text(grossDetail, M + 6, y);
        y += 12;

        deductions.forEach(d => {
            doc.fontSize(9).font('Helvetica').fillColor('#000').text(d.label, M + 6, y);
            doc.font('Helvetica-Bold').text(d.isPending ? 'FULL (Pending)' : `- Rs.${d.value.toLocaleString()}`, M + 6, y, { width: CW - 12, align: 'right' });
            y += 13;
        });

        if (deductions.length > 0 && !dieselPending) {
            doc.moveTo(M + 6, y).lineTo(PW - M - 6, y).strokeColor('#000').lineWidth(0.5).stroke();
            y += 4;
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text('Total Deductions', M + 6, y);
            doc.text(`- Rs.${Math.round(totalDeductions).toLocaleString()}`, M + 6, y, { width: CW - 12, align: 'right' });
            y += 14;
        }

        // NET PAYABLE
        y += 4;
        if (dieselPending) {
            doc.rect(M, y, CW, 24).fill('#000');
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#fff').text('NET PAYABLE', M + 8, y + 6);
            doc.fontSize(9).text('DIESEL PENDING', M + 8, y + 7, { width: CW - 16, align: 'right' });
            y += 30;
        } else {
            doc.rect(M, y, CW, 24).fill('#000');
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#fff').text('NET PAYABLE', M + 8, y + 6);
            doc.text(`Rs.${Math.round(net).toLocaleString()}`, M + 8, y + 6, { width: CW - 16, align: 'right' });
            y += 30;
        }

        // Signatures
        y = Math.max(y + 10, doc.page.height - 50);
        const sigW = CW / 3;
        ['Driver Sign', 'Accountant', 'Authorised Sign'].forEach((lbl, i) => {
            const sx = M + i * sigW;
            doc.moveTo(sx + 5, y).lineTo(sx + sigW - 5, y).strokeColor('#000').lineWidth(0.5).stroke();
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text(lbl, sx, y + 4, { width: sigW, align: 'center' });
        });

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

/**
 * Generates a loading receipt PDF that exactly matches the browser print from LRModule.jsx.
 */
async function generateLoadingReceiptPDF(data, outputPath) {
    const materials = data.materials && data.materials.length > 0
        ? data.materials
        : [{ type: data.material, bags: data.totalBags, weight: data.weight }];

    const totalBags = materials.reduce((s, m) => s + (parseInt(m.bags || m.totalBags) || 0), 0);
    const totalWeight = materials.reduce((s, m) => s + (parseFloat(m.weight) || 0), 0);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A6' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        const PW = doc.page.width, M = 30, CW = PW - M * 2;
        let y = M;

        // Header — matches browser print
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text('JK Lakshmi Depo Loading Receipt', M, y, { align: 'center', width: CW });
        y += 16;
        doc.fontSize(12).font('Helvetica-Bold').text('Vikas Goods Transport Company', M, y, { align: 'center', width: CW });
        y += 14;
        doc.fontSize(8).font('Helvetica').text('VGTC, Metro Market, Behind SBI Bank, Jhamri Mod, Jharli, Jhajjar', M, y, { align: 'center', width: CW });
        y += 12;
        doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#000').lineWidth(1.5).stroke();
        y += 10;

        // LR badge
        const badge = `LR # ${data.lrNo}`;
        const bw = doc.widthOfString(badge) + 20;
        doc.rect((PW - bw) / 2, y, bw, 18).strokeColor('#000').lineWidth(1.5).stroke();
        doc.fontSize(12).font('Helvetica-Bold').text(badge, M, y + 4, { align: 'center', width: CW });
        y += 26;

        // Info rows
        const drawInfoRow = (label, value) => {
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(label.toUpperCase(), M, y);
            doc.font('Helvetica').text(String(value || '—'), M + CW * 0.4, y, { width: CW * 0.6, align: 'right' });
            y += 14;
            doc.moveTo(M, y - 2).lineTo(PW - M, y - 2).strokeColor('#ccc').lineWidth(0.5).stroke();
        };
        drawInfoRow('Date', data.date);
        drawInfoRow('Truck No.', data.truckNo);
        drawInfoRow('Party Name', data.partyName);
        if (data.billing && data.billing !== 'No') drawInfoRow('Challans', data.billing);
        y += 6;

        // Table
        const cols = [M, M + CW * 0.35, M + CW * 0.6, M + CW * 0.8];
        doc.rect(M, y, CW, 16).fill('#e8e8e8');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
        doc.text('MATERIAL', cols[0] + 4, y + 4);
        doc.text('TYPE', cols[1] + 4, y + 4);
        doc.text('BAGS', cols[2] + 4, y + 4);
        doc.text('WT (MT)', cols[3] + 4, y + 4);
        y += 16;

        materials.forEach(m => {
            doc.rect(M, y, CW, 16).strokeColor('#000').lineWidth(0.5).stroke();
            doc.fontSize(9).font('Helvetica').fillColor('#000');
            doc.text(m.type || m.material || '—', cols[0] + 4, y + 4);
            doc.font('Helvetica-Bold').text(m.loadingType || data.loadingType || 'Godown', cols[1] + 4, y + 4);
            doc.font('Helvetica').text(String(m.bags || m.totalBags || 0), cols[2] + 4, y + 4);
            doc.text(`${parseFloat(m.weight || 0).toFixed(2)}`, cols[3] + 4, y + 4);
            y += 16;
        });

        doc.rect(M, y, CW, 16).fill('#e8e8e8').strokeColor('#000').lineWidth(1).stroke();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
        doc.text('TOTAL', cols[0] + 4, y + 4, { width: cols[2] - cols[0] - 8, align: 'right' });
        doc.text(String(totalBags), cols[2] + 4, y + 4);
        doc.text(`${totalWeight.toFixed(2)} MT`, cols[3] + 4, y + 4);
        y += 24;

        // Signatures
        y = Math.max(y, doc.page.height - 50);
        const sigW = CW / 3;
        ['Driver Sign', 'Receiver Sign', 'Authorised Sign'].forEach((lbl, i) => {
            const sx = M + i * sigW;
            doc.moveTo(sx + 5, y).lineTo(sx + sigW - 5, y).strokeColor('#000').lineWidth(0.5).stroke();
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text(lbl, sx, y + 4, { width: sigW, align: 'center' });
        });

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
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

/**
 * Generates a Sale Receipt PDF that mimics the SellModule print format.
 */
async function generateSalePDF(s, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A5' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        const PW = doc.page.width;
        const M = 40;

        // Header
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#1e293b').text('VIKAS GOODS', M, M, { align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Cement Sales Receipt', M, M + 22, { align: 'center' });
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
        drawRow('Payment', s.paymentStatus === 'pending' ? 'Not Paid (Pending)' : s.paymentType.toUpperCase());

        doc.moveDown(1);
        doc.rect(M, doc.y, PW - M * 2, 40).fill('#f8fafc');
        doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold').text('TOTAL AMOUNT', M + 10, doc.y + 13);
        doc.text(`Rs. ${s.totalAmount.toLocaleString('en-IN')}`, M, doc.y - 14, { align: 'right', width: PW - M * 2 - 10 });
        
        doc.moveDown(2);
        
        // Status Stamp
        const isPending = s.paymentStatus === 'pending';
        doc.save();
        doc.rotate(-5, { origin: [PW - M - 60, doc.y + 10] });
        doc.rect(PW - M - 140, doc.y, 140, 25).lineWidth(2).strokeColor(isPending ? '#f43f5e' : '#10b981').stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor(isPending ? '#f43f5e' : '#10b981')
            .text(isPending ? 'NOT PAID' : `PAID - ${s.paymentType.toUpperCase()}`, PW - M - 140, doc.y + 7, { width: 140, align: 'center' });
        doc.restore();

        doc.fontSize(8).fillColor('#94a3b8').text(`Generated on ${new Date().toLocaleString('en-IN')}`, M, doc.page.height - 50, { align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

module.exports = {
    generateModuleReport,
    generateReceiptPDF,
    generateVoucherPDF,
    generateLoadingReceiptPDF,
    generateVoucherListPDF,
    generateInvoicePDF,
    generateSalePDF,
};
