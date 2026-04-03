require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { generateLoadingReceiptPDF, generateVoucherPDF } = require('./utils/pdfService');
const driveService = require('./utils/driveService');

async function test() {
    try {
        console.log('Testing Drive Auth:', await driveService.isAuthorized());
        const TEMP_DIR = path.join(__dirname, 'temp_backups');
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

        const testData = { lrNo: '998', date: '2026-04-03', truckNo: 'RJ14-1234', destination: 'Delhi', weight: 30, rate: 1000, type: 'Dump' };
        
        const fileName = `Voucher_LR998_2026-04-03.pdf`;
        const localPath = path.join(TEMP_DIR, fileName);

        console.log('Generating Voucher PDF...');
        await generateVoucherPDF(testData, localPath);
        console.log('PDF Generated at', localPath);

        const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
        const vRoot = await driveService.getOrCreateFolder('Vouchers_Individual', rootId);
        const plantFolder = await driveService.getOrCreateFolder('Dump', vRoot);
        
        console.log('Uploading Voucher...');
        await driveService.uploadFile(localPath, fileName, plantFolder);
        console.log('Uploaded successfully!');
    } catch (e) {
        console.error('ERROR:', e.message, e.stack);
    }
}
test();
