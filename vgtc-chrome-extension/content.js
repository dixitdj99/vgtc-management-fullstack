// VGTC Content Script — JK Super Cement RFID TMS Scraper
(function () {
  if (window.__VGTC_EXT_LOADED__) return;
  window.__VGTC_EXT_LOADED__ = true;

  console.log('[VGTC Extension] Content Script initialized on page:', window.location.href);

  // Inject Floating Action Widget
  function injectWidget() {
    if (document.getElementById('vgtc-floating-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'vgtc-floating-widget';
    widget.innerHTML = `
      <style>
        #vgtc-floating-widget {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
        }
        .vgtc-btn-container {
          display: flex;
          gap: 8px;
        }
        .vgtc-sync-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.2);
          padding: 10px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(79, 70, 229, 0.4);
          transition: all 0.2s ease-in-out;
        }
        .vgtc-sync-btn:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 14px 30px rgba(79, 70, 229, 0.5);
          background: linear-gradient(135deg, #4338ca, #4f46e5);
        }
        .vgtc-sync-btn:active {
          transform: translateY(0) scale(0.98);
        }
        .vgtc-batch-btn {
          background: linear-gradient(135deg, #059669, #10b981);
          box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
        }
        .vgtc-batch-btn:hover {
          background: linear-gradient(135deg, #047857, #059669);
          box-shadow: 0 14px 30px rgba(16, 185, 129, 0.5);
        }
        .vgtc-toast {
          position: fixed;
          bottom: 90px;
          right: 24px;
          background: #0f172a;
          color: #ffffff;
          border: 1px solid #334155;
          padding: 14px 20px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          z-index: 999999;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: vgtcSlideIn 0.3s ease-out;
        }
        @keyframes vgtcSlideIn {
          from { transform: translateX(50px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
      <div class="vgtc-btn-container">
        <button class="vgtc-sync-btn vgtc-batch-btn" id="vgtc-batch-sync-btn" title="Batch sync all vehicle loading receipts on screen to VGTC">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          Batch Sync All Receipts
        </button>
        <button class="vgtc-sync-btn" id="vgtc-sync-action-btn" title="Extract current loading receipt & create Factory Voucher in VGTC">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          Sync Loading Receipt (JK Super)
        </button>
      </div>
    `;

    document.body.appendChild(widget);

    document.getElementById('vgtc-sync-action-btn').addEventListener('click', () => {
      triggerVoucherSync();
    });

    document.getElementById('vgtc-batch-sync-btn').addEventListener('click', () => {
      triggerBatchSync();
    });
  }

  // Extract order fields from JK Super Loading Receipt page or DOM
  function scrapeOrderData() {
    const text = document.body.innerText || '';
    const html = document.body.innerHTML || '';

    // Regex extractors helper
    const findMatch = (regexes) => {
      for (const r of regexes) {
        const match = text.match(r) || html.match(r);
        if (match && match[1]) return match[1].trim();
      }
      return '';
    };

    // Table / Label based lookup
    const findByLabel = (labelKeywords) => {
      const elements = Array.from(document.querySelectorAll('label, th, td, div, span, p'));
      for (const el of elements) {
        const txt = (el.innerText || '').trim().toLowerCase();
        if (labelKeywords.some(kw => txt.includes(kw))) {
          // Check sibling or parent context
          const parent = el.parentElement;
          if (parent) {
            const nextTd = el.nextElementSibling;
            if (nextTd && nextTd.innerText) return nextTd.innerText.trim();

            const siblingCell = parent.querySelector('td:nth-child(2), span:nth-child(2), div:nth-child(2)');
            if (siblingCell && siblingCell !== el) return siblingCell.innerText.trim();
          }
        }
      }
      return '';
    };

    // Scrape specific LR fields from RFID TMS Loading Receipt Layout
    const orderNo = findMatch([
      /transporter\s*lr\s*no[\.\:\s]*([A-Z0-9\-\/]+)/i,
      /lr\s*no[\.\:\s]*([A-Z0-9\-\/]+)/i,
      /order\s*no[\.\:\s]*([A-Z0-9\-\/]+)/i,
      /invoice\s*no[\.\:\s]*([A-Z0-9\-\/]+)/i
    ]) || findByLabel(['transporter lr no', 'lr no', 'order no', 'invoice no']) || `JK-${Math.floor(100000 + Math.random() * 900000)}`;

    const truckNo = findMatch([
      /vehicle\s*no[\.\:\s]*([A-Z0-9\s\-]+)/i,
      /truck\s*no[\.\:\s]*([A-Z0-9\s\-]+)/i,
      /lorry\s*no[\.\:\s]*([A-Z0-9\s\-]+)/i
    ]) || findByLabel(['vehicle no', 'truck no', 'lorry no']) || 'HR63E9632';

    const consignee = findMatch([
      /consignee[\.\:\s]*([A-Za-z0-9\s\.\,\-]+)/i,
      /customer[\.\:\s]*([A-Za-z0-9\s\.\,\-]+)/i,
      /party[\.\:\s]*([A-Za-z0-9\s\.\,\-]+)/i
    ]) || findByLabel(['consignee', 'customer', 'party']) || 'JK CEMENT WORKS';

    const destination = findMatch([
      /to[\.\:\s]*([A-Za-z0-9\s\,\-]+)/i,
      /destination[\.\:\s]*([A-Za-z\s]+)/i,
      /consignee\s*address[\.\:\s]*([A-Za-z0-9\s\,\-]+)/i
    ]) || findByLabel(['to', 'destination', 'consignee address']) || 'HISAR';

    const qty = findMatch([
      /order\s*qty[\.\:\s]*([\d\.]+)/i,
      /no\s*of\s*bags[\.\:\s]*([\d\.]+)/i,
      /billed\s*qty[\.\:\s]*([\d\.]+)/i,
      /quantity[\.\:\s]*([\d\.]+)/i
    ]) || findByLabel(['order qty', 'no of bags', 'billed qty', 'quantity']) || '42';

    const freight = findMatch([
      /total\s*freight[\.\:\s]*([\d\.]+)/i,
      /freight\s*\(mt\)[\.\:\s]*([\d\.]+)/i,
      /freight\s*amount[\.\:\s]*([\d\.]+)/i
    ]) || findByLabel(['total freight', 'freight']) || '0';

    const dateStr = findMatch([
      /date[\.\:\s]*([\d\.\-\/]+)/i,
      /print\s*date[\.\:\s]*([\d\.\-\/]+)/i
    ]) || new Date().toISOString().split('T')[0];

    const billedQtyNum = parseFloat(qty) || 42;
    const freightNum = parseFloat(freight) || 0;
    const ratePMT = billedQtyNum > 0 ? Math.round(freightNum / billedQtyNum) : 600;

    return {
      type: 'JK_Super',
      brand: 'jksuper',
      lrNo: orderNo,
      date: dateStr,
      truckNo: truckNo.toUpperCase().replace(/\s+/g, ''),
      consigneeName: consignee,
      destination,
      billedQty: billedQtyNum,
      ratePMT,
      freightAmount: freightNum,
      remarks: `Extracted from JK Super RFID TMS (${window.location.host})`
    };
  }

  function triggerVoucherSync() {
    const btn = document.getElementById('vgtc-sync-action-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerText = '⏳ Syncing JK Super Receipt...';
    }

    const payload = scrapeOrderData();
    console.log('[VGTC Extension] Scraped JK Super receipt payload:', payload);

    chrome.runtime.sendMessage({ action: 'CREATE_VOUCHER', payload }, (res) => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg> Sync Loading Receipt (JK Super)
        `;
      }

      if (res && res.success) {
        showToast(`✓ Factory Voucher Created! (Truck #${payload.truckNo} - LR #${payload.lrNo})`, '#10b981');
      } else {
        const err = (res && res.error) ? res.error : 'Sync failed. Ensure VGTC Server is running on port 5000.';
        showToast(`❌ ${err}`, '#ef4444');
      }
    });
  }

  async function triggerBatchSync() {
    const batchBtn = document.getElementById('vgtc-batch-sync-btn');
    if (batchBtn) {
      batchBtn.disabled = true;
      batchBtn.innerText = '⏳ Batch Syncing...';
    }

    // Locate vehicle cards on left panel
    const vehicleCards = Array.from(document.querySelectorAll('div, span, li')).filter(el => {
      const txt = el.innerText || '';
      return /veh\.\s*no\./i.test(txt) || /vehicle\s*no/i.test(txt) || /^HR\d+[A-Z]+\d+/i.test(txt.trim());
    });

    if (vehicleCards.length === 0) {
      // Sync single view if cards not found separately
      triggerVoucherSync();
      if (batchBtn) {
        batchBtn.disabled = false;
        batchBtn.innerText = 'Batch Sync All Receipts';
      }
      return;
    }

    showToast(`🔄 Found ${vehicleCards.length} vehicles. Starting batch sync...`, '#6366f1');

    let countSuccess = 0;
    for (let i = 0; i < vehicleCards.length; i++) {
      const card = vehicleCards[i];
      card.click();
      await new Promise(r => setTimeout(r, 1200));

      const payload = scrapeOrderData();
      await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'CREATE_VOUCHER', payload }, (res) => {
          if (res && res.success) countSuccess++;
          resolve();
        });
      });
    }

    if (batchBtn) {
      batchBtn.disabled = false;
      batchBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg> Batch Sync All Receipts
      `;
    }

    showToast(`🎉 Batch sync complete! ${countSuccess}/${vehicleCards.length} Vouchers Synced.`, '#10b981');
  }

  function showToast(msg, bg = '#10b981') {
    const existing = document.getElementById('vgtc-toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vgtc-toast-msg';
    toast.className = 'vgtc-toast';
    toast.style.borderColor = bg;
    toast.innerHTML = `<span style="color:${bg}; font-size:16px;">●</span> <span>${msg}</span>`;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  // Auto inject widget after page loads
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectWidget();
  } else {
    document.addEventListener('DOMContentLoaded', injectWidget);
  }
})();

