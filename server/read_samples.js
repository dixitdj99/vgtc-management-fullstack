const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const pdf = require('pdf-parse');

async function main() {
  const dir = 'b:\\VGTC Managemet\\samples';
  
  // 1. Read Excel
  const xlPath = path.join(dir, 'VIKAS GOODS.xlsx');
  console.log('--- EXCEL HEADERS ---');
  if (fs.existsSync(xlPath)) {
    const workbook = xlsx.readFile(xlPath);
    console.log('Sheet Names:', workbook.SheetNames);
    
    // Sheet 1
    const firstSheetName = workbook.SheetNames[0];
    const data1 = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1 });
    console.log(`\n--- SHEET 1: ${firstSheetName} (first 3 rows) ---`);
    console.log(data1.slice(0, 3)); 

    // Sheet 2
    if (workbook.SheetNames.length > 1) {
      const secondSheetName = workbook.SheetNames[1];
      const data2 = xlsx.utils.sheet_to_json(workbook.Sheets[secondSheetName], { header: 1 });
      console.log(`\n--- SHEET 2: ${secondSheetName} (first 3 rows) ---`);
      console.log(data2.slice(0, 3)); 
    }
  }

  // 2. Read PDFs
  const pdfs = ['JK super dump.pdf', 'Jk super handling.pdf', 'Jk super.pdf'];
  console.log('\n--- PDF TEXTS ---');
  for (const p of pdfs) {
    const pPath = path.join(dir, p);
    if (fs.existsSync(pPath)) {
        const dataBuffer = fs.readFileSync(pPath);
        try {
            const pdfParse = pdf.default || pdf;
            const data = await pdfParse(dataBuffer);
            console.log(`\n========= ${p} =========\n`);
            console.log(data.text.substring(0, 1500));
        } catch(e) {
            console.log(`Failed to read ${p}:`, e.message);
        }
    }
  }
}

main().catch(console.error);
