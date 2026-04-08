const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');

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
    
    const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
    const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
    const diesel = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
    const cash = parseFloat(v.advanceCash) || 0;
    const online = parseFloat(v.advanceOnline) || 0;
    const munshi = parseFloat(v.munshi) || 0;
    const commission = parseFloat(v.commission) || 0;
    const totalDeductions = diesel + cash + online + munshi + commission;
    const net = gross - totalDeductions;

    const deductions = [
        { label: 'Diesel Advance', value: diesel, isPending: dieselPending },
        { label: 'Cash Advance', value: cash },
        { label: 'Online Advance', value: online },
        { label: 'Munshi', value: munshi },
        { label: 'Commission', value: commission },
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
            
            doc.text(`M/s.  ${v.partyName || ''}`, col1 + 5, y + 5);
            doc.moveTo(col1, y + 15).lineTo(col2, y + 15).stroke();
            doc.moveTo(col1, y + 30).lineTo(col2, y + 30).stroke();
            doc.text('S.T.L. No.', col1 + 5, y + 35);
            doc.text('C.S.T. No.', col1 + 100, y + 35);
            
            doc.text(`Truck No.  ${v.truckNo || ''}`, col2 + 5, y + 5);
            doc.moveTo(col2, y + 15).lineTo(PW - M, y + 15).stroke();
            doc.text(`From : ${v.type === 'Kosli_Bill' ? 'Kosli' : 'Jhajjar'}`, col2 + 5, y + 18);
            doc.moveTo(col2, y + 30).lineTo(PW - M, y + 30).stroke();
            doc.text(`To  ${v.destination || ''}`, col2 + 50, y + 18);
            doc.text(`S. No. ${v.lrNo}`, col2 + 5, y + 35);
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
            doc.fontSize(7).text('CEMENT\nGrade\nJ.K. Super Cement\nPPC\n43\n53\nValue of Goods\nBill No. :\nShipment No. :\nD.I. No.', cwX[0] + 5, descY);
            
            doc.fontSize(9).text(v.weight ? v.weight + ' MT' : '', cwX[1] + 5, y + 10, { width: cw3 - 10, align: 'center' });
            doc.fontSize(8).text(v.rate || '', cwX[2] + 5, y + 10, { width: cw4 - 10, align: 'center' });
            
            doc.fontSize(8).font('Helvetica-Bold').text(`Advance = \n${dieselPending ? 'FULL (Pending)' : (!totalDeductions ? '—' : 'Rs.' + Math.round(totalDeductions).toLocaleString())}`, cwX[3] + 5, y + 30, { width: cw5*2 - 10, align: 'center' });
            doc.fontSize(10).text(`To be Billed\n\n${dieselPending ? '—' : 'Rs.' + Math.round(net).toLocaleString()}`, cwX[5] + 5, y + 20, { width: cw7 - 10, align: 'center' });
            doc.fontSize(7).font('Helvetica').text(`Driver Name\nD.L. No.\nOwner Permit No.\nPermit No.\nAddress\n\n${v.pump ? 'Pump: ' + v.pump : ''}`, cwX[6] + 5, y + 5);
            
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

        // PW=467 (approx 165mm), PH depends on content, we will use a tall fixed height
        const PW = 467, PH = 550, M = 28, CW = PW - M * 2;
        const doc = new PDFDocument({ margin: 0, size: [PW, PH] });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Draw outer thick black border (like the physical slip)
        doc.rect(M - 10, M - 10, CW + 20, PH - (M * 2) + 20).strokeColor('#000').lineWidth(2).stroke();

        let y = M;

        function dashedLine(dy) {
            doc.moveTo(M, dy).lineTo(PW - M, dy).strokeColor('#000').dash(4, { space: 4 }).lineWidth(0.5).stroke();
            doc.undash();
        }

        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text('VIKAS GOODS TRANSPORT', { align: 'center', characterSpacing: 1.5 });
        doc.fontSize(10).font('Helvetica').fillColor('#555')
            .text(`${v.type ? v.type.replace('_', ' ') : 'Dump'} Voucher`, { align: 'center' });
        y += 24;

        dashedLine(y); y += 8;

        // LR + Date
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text('LR No.:', M, y);
        doc.font('Helvetica').text(`#${v.lrNo}`, M + 45, y);
        doc.font('Helvetica-Bold').text('Date:', PW / 2, y);
        doc.font('Helvetica').text(v.date || '—', PW / 2 + 35, y);
        y += 18;

        // Truck + Destination
        doc.font('Helvetica-Bold').text('Truck:', M, y);
        doc.font('Helvetica').text(v.truckNo || '—', M + 42, y);
        doc.font('Helvetica-Bold').text('Destination:', PW / 2, y);
        doc.font('Helvetica').text(v.destination || '—', PW / 2 + 70, y);
        y += 14;

        dashedLine(y); y += 10;

        // 2x2 grid: Weight, Bags, Rate, Pump
        const CELLW = (CW - 6) / 2, CELLH = 34;
        const drawCell = (label, value, cx, cy) => {
            doc.rect(cx, cy, CELLW, CELLH).strokeColor('#ccc').lineWidth(0.5).stroke();
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#666').text(label.toUpperCase(), cx + 8, cy + 6, { width: CELLW - 10 });
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(String(value || '—'), cx + 8, cy + 18, { width: CELLW - 10 });
        };
        drawCell('Weight', `${v.weight} MT`, M, y);
        drawCell('Bags', v.bags || '—', M + CELLW + 6, y);
        y += CELLH + 6;
        drawCell('Rate', `Rs.${v.rate}/MT`, M, y);
        drawCell('Pump', v.pump || '—', M + CELLW + 6, y);
        y += CELLH + 12;

        // Calc box
        const calcH = 46 + deductions.length * 16 + (deductions.length > 0 && !dieselPending ? 20 : 0);
        doc.rect(M, y, CW, calcH).fill('#fafafa').strokeColor('#ccc').lineWidth(0.5).stroke();
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#666').text('PAYMENT CALCULATION', M + 10, y + 8, { characterSpacing: 0.5 });

        const calcY = y + 22;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text('Gross Total', M + 10, calcY);
        doc.text(`Rs.${Math.round(gross).toLocaleString()}`, M + 10, calcY, { width: CW - 20, align: 'right' });
        doc.moveTo(M + 10, calcY + 16).lineTo(PW - M - 10, calcY + 16).strokeColor('#ddd').lineWidth(1).stroke();
        doc.fontSize(8).font('Helvetica').fillColor('#666').text(`${v.weight} MT × Rs.${v.rate}/MT`, M + 10, calcY + 18);

        let dy = calcY + 34;
        deductions.forEach(d => {
            doc.fontSize(11).font('Helvetica').fillColor('#444').text(d.label, M + 10, dy);
            if (d.isPending) {
                doc.fillColor('#92400e').text('FULL (Pending)', M + 10, dy, { width: CW - 20, align: 'right' });
            } else {
                doc.fillColor('#c0392b').text(`- Rs.${d.value.toLocaleString()}`, M + 10, dy, { width: CW - 20, align: 'right' });
            }
            dy += 16;
        });

        if (deductions.length > 0 && !dieselPending) {
            doc.moveTo(M + 10, dy - 2).lineTo(PW - M - 10, dy - 2).strokeColor('#bbb').lineWidth(0.5).stroke();
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Total Deductions', M + 10, dy + 2);
            doc.fillColor('#c0392b').text(`- Rs.${Math.round(totalDeductions).toLocaleString()}`, M + 10, dy + 2, { width: CW - 20, align: 'right' });
        }
        y += calcH + 10;

        // NET PAYABLE box
        if (dieselPending) {
            doc.rect(M, y, CW, 36).fill('#92400e');
            doc.fontSize(13).font('Helvetica-Bold').fillColor('#fff').text('NET PAYABLE', M + 12, y + 12);
            doc.fontSize(10).text('⏳ DIESEL PENDING', M + 12, y + 13, { width: CW - 24, align: 'right' });
            y += 44;
            
            doc.rect(M, y, CW, 30).fill('#fffbeb').strokeColor('#fcd34d').lineWidth(1).stroke();
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#92400e')
                .text('⚠ Diesel advance is FULL TANK — actual amount not entered yet.', M + 8, y + 8, { width: CW - 16 });
            y += 40;
        } else {
            doc.rect(M, y, CW, 36).fill('#000');
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#fff').text('NET PAYABLE', M + 12, y + 11);
            doc.text(`Rs.${Math.round(net).toLocaleString()}`, M + 12, y + 11, { width: CW - 24, align: 'right' });
            y += 44;
        }

        y += 8;
        doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#000').lineWidth(0.5).stroke();
        y += 18;

        // Signatures
        const sigW = CW / 3;
        ['Driver', 'Accountant', 'Authorised'].forEach((lbl, i) => {
            const sx = M + i * sigW;
            doc.moveTo(sx + 10, y).lineTo(sx + sigW - 15, y).strokeColor('#000').lineWidth(0.5).stroke();
            doc.fontSize(10).font('Helvetica').fillColor('#000').text(lbl, sx, y + 6, { width: sigW, align: 'center' });
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
        const PW = 595, PH = 500, M = 30, CW = PW - M * 2;
        const doc = new PDFDocument({ margin: 0, size: [PW, PH] });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        let y = M;

        doc.moveTo(M, y + 30).lineTo(PW - M, y + 30).strokeColor('#6366f1').lineWidth(3).stroke();
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#6366f1').text('Loading Receipt', M, y);
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a')
            .text(`LR #${data.lrNo}`, PW - M - 120, y, { width: 120, align: 'right' });
        y += 42;

        const infoW = (CW - 15) / 2;
        const drawInfo = (label, value, ix, iy) => {
            doc.rect(ix, iy, infoW, 38).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text(label.toUpperCase(), ix + 10, iy + 7);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text(String(value || '—'), ix + 10, iy + 20);
        };
        drawInfo('Date', data.date, M, y);
        drawInfo('Truck No.', data.truckNo, M + infoW + 15, y);
        y += 42;

        doc.rect(M, y, CW, 38).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('PARTY NAME', M + 10, y + 7);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text(data.partyName || '—', M + 10, y + 20);
        y += 44;

        if (data.destination) {
            doc.rect(M, y, CW, 38).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('DESTINATION', M + 10, y + 7);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text(data.destination, M + 10, y + 20);
            y += 44;
        }

        if (data.billing && data.billing !== 'No') {
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('ATTACHED CHALLANS', M, y);
            doc.fontSize(10).font('Helvetica').fillColor('#1e293b').text(data.billing, M + 130, y);
            y += 16;
        }

        const C1 = M, C2 = M + CW * 0.5, C3 = M + CW * 0.75;
        doc.rect(M, y, CW, 22).fill('#f1f5f9');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569').text('MATERIAL', C1 + 8, y + 7);
        doc.text('BAGS', C2 + 8, y + 7);
        doc.text('WEIGHT (MT)', C3 + 8, y + 7);
        y += 22;

        materials.forEach((m, i) => {
            const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(M, y, CW, 20).fill(rowBg).strokeColor('#cbd5e1').lineWidth(0.3).stroke();
            doc.fontSize(10).font('Helvetica').fillColor('#1e293b').text(m.type || m.material || '—', C1 + 8, y + 6);
            doc.text(String(m.bags || m.totalBags || 0), C2 + 8, y + 6);
            doc.text(`${parseFloat(m.weight || 0).toFixed(2)} MT`, C3 + 8, y + 6);
            y += 20;
        });

        doc.rect(M, y, CW, 22).fill('#f8fafc').strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('TOTAL', C1 + 8, y + 7, { width: C2 - C1 - 10, align: 'right' });
        doc.text(String(totalBags), C2 + 8, y + 7);
        doc.text(`${totalWeight.toFixed(2)} MT`, C3 + 8, y + 7);
        y += 26;

        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
            .text(`System Backup | LR #${data.lrNo} | Generated: ${new Date().toLocaleString('en-IN')}`, M, y + 10, { width: CW, align: 'center' });

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
 * Generates a formal Tax Invoice PDF for multiple Loading Receipts.
 * Includes Header, Invoice Details, Party Info, and a detailed table of LRs.
 */
async function generateInvoicePDF(invoiceData, outputPath) {
    const { 
        invoiceNumber, 
        invoiceDate, 
        partyName, 
        items, // Array of LRs
        billingEntity = 'VIKAS GOODS TRANSPORT',
        address = 'Jharli, Jhajjar, Haryana',
        contact = '+91 9999999999'
    } = invoiceData;

    const totalWeight = items.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0);
    const totalBags = items.reduce((s, v) => s + (parseInt(v.totalBags || v.bags) || 0), 0);
    const totalAmount = items.reduce((s, v) => s + (parseFloat(v.totalAmount || v.amount || 0)), 0);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // ── Header ───────────────────────────────────────────────
        doc.rect(30, 30, doc.page.width - 60, 60).fill('#1e293b');
        doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text(billingEntity, 40, 45);
        doc.fontSize(10).font('Helvetica').text('TAX INVOICE', 40, 72);
        doc.fontSize(10).text(`${address} | ${contact}`, 30, 45, { align: 'right', width: doc.page.width - 70 });
        
        let y = 110;

        // ── Invoice Details ──────────────────────────────────────
        doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text('INVOICE TO:', 30, y);
        doc.fontSize(14).text(partyName || '—', 30, y + 14);
        
        doc.fontSize(10).font('Helvetica-Bold').text('INVOICE NO:', 400, y);
        doc.font('Helvetica').text(invoiceNumber || '—', 480, y);
        doc.font('Helvetica-Bold').text('DATE:', 400, y + 14);
        doc.font('Helvetica').text(invoiceDate || '—', 480, y + 14);
        
        y += 60;

        // ── Table ────────────────────────────────────────────────
        const table = {
            title: 'Loading Receipts Detail',
            headers: [
                { label: 'Date', property: 'date', width: 60 },
                { label: 'LR No.', property: 'lrNo', width: 50 },
                { label: 'Truck', property: 'truckNo', width: 70 },
                { label: 'Destination', property: 'destination', width: 100 },
                { label: 'Material', property: 'material', width: 100 },
                { label: 'Bags', property: 'totalBags', width: 50 },
                { label: 'Weight(MT)', property: 'weight', width: 60 },
            ],
            rows: items.map(v => [
                v.date || '—',
                `#${v.lrNo}`,
                v.truckNo || '—',
                v.destination || '—',
                v.material || '—',
                String(v.totalBags || 0),
                `${parseFloat(v.weight || 0).toFixed(2)} MT`
            ])
        };

        doc.table(table, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e293b'),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.font('Helvetica').fontSize(9).fillColor('#000');
            },
        });

        // ── Totals ───────────────────────────────────────────────
        y = doc.y + 20;
        doc.rect(30, y, doc.page.width - 60, 40).fill('#f8fafc');
        doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('GRAND TOTALS', 40, y + 15);
        doc.text(`Bags: ${totalBags} | Weight: ${totalWeight.toFixed(2)} MT`, 250, y + 15, { align: 'right', width: doc.page.width - 290 });

        // ── Footer ───────────────────────────────────────────────
        doc.fontSize(8).fillColor('#94a3b8').text('This is a computer generated invoice and does not require a physical signature.', 30, doc.page.height - 50, { align: 'center' });

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
};
