const XLSX = require('xlsx');
const wb = XLSX.readFile('samples/VIKAS GOODS.xlsx');

// Show all Sheet1 data to understand the "SALES DOC TYPE" column
const ws1 = wb.Sheets['Sheet1'];
const data1 = XLSX.utils.sheet_to_json(ws1);
// Count how many have blank SALES DOC TYPE
const blank = data1.filter(r => !r['SALES DOC TYPE'] || String(r['SALES DOC TYPE']).trim() === '' || r['SALES DOC TYPE'] === null);
const nonBlank = data1.filter(r => r['SALES DOC TYPE'] && String(r['SALES DOC TYPE']).trim() !== '');
console.log(`Sheet1 total: ${data1.length}, Blank SaleDocType: ${blank.length}, Non-Blank: ${nonBlank.length}`);
console.log('Sample blank entries:', JSON.stringify(blank.slice(0,3), null, 2));
console.log('Sample non-blank entries:', JSON.stringify(nonBlank.slice(0,3), null, 2));
console.log('Unique SALES DOC TYPE values:', [...new Set(data1.map(r => r['SALES DOC TYPE']))]);

// Sheet2 full structure
const ws2 = wb.Sheets['Sheet2'];
const data2 = XLSX.utils.sheet_to_json(ws2);
console.log(`\nSheet2 total: ${data2.length}`);
console.log('Sheet2 sample:', JSON.stringify(data2[0], null, 2));
// List all LR Nos in Sheet2
console.log('Sheet2 LR Nos:', data2.map(r => r['LR No']).slice(0, 10));
