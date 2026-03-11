const puppeteer = require('puppeteer');
(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const lrBtn = btns.find(b => b.textContent && b.textContent.includes('Loading Receipts'));
        if (lrBtn) lrBtn.click();
    });
    
    await page.waitForTimeout(1000);
    
    await page.evaluate(() => {
        const truckInput = document.querySelector('input[placeholder="e.g. GJ01XX1234"]');
        if (truckInput) {
            truckInput.value = 'TEST';
            truckInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const partyInput = document.querySelector('input[placeholder="Client name"]');
        if (partyInput) {
            partyInput.value = 'TEST';
            partyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        const bagsInput = document.querySelector('input[placeholder="0"]');
        if (bagsInput) {
            bagsInput.value = '50';
            bagsInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    await page.waitForTimeout(500);

    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.textContent && b.textContent.includes('Save Receipt'));
        if(saveBtn) saveBtn.click();
    });
    
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
       const btns = Array.from(document.querySelectorAll('button'));
       const confBtn = btns.find(b => b.textContent && b.textContent.includes('Confirm'));
       if(confBtn) confBtn.click();
    });
  
    await page.waitForTimeout(2000);
    await browser.close();
  } catch(e) { console.error('Error:', e); process.exit(1); }
})();
