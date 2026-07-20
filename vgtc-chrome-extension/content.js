// VGTC Content Script — JK Super Cement Order Scraper
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
        }
        .vgtc-sync-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.2);
          padding: 12px 20px;
          border-radius: 14px;
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
        .vgtc-toast {
          position: fixed;
          bottom: 80px;
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
      <button class="vgtc-sync-btn" id="vgtc-sync-action-btn" title="Extract order details and create Factory Voucher in VGTC">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        Sync Factory Voucher to VGTC
      </button>
    `;

    document.body.appendChild(widget);

    document.getElementById('vgtc-sync-action-btn').addEventListener('click', () => {
      triggerVoucherSync();
    });
  }

  // Extract order fields from page
  function scrapeOrderData() {
    const text = document.body.innerText || '';
    const html = document.body.innerHTML || '';

    // Regex extractors
    const findMatch = (regexes) => {
      for (const r of regexes) {
        const match = text.match(r) || html.match(r);
        if (match && match[1]) return match[1].trim();
      }
      return '';
    };

    // Helper to search input values or table cells by label
    const findByLabel = (labelKeywords) => {
      const elements = Array.from(document.querySelectorAll('label, th, td, div, span'));
      for (const el of elements) {
        const txt = el.innerText || '';
        if (labelKeywords.some(kw => txt.toLowerCase().includes(kw))) {
          // Check next sibling or parent input
          const nextEl = el.nextElementSibling || el.parentElement?.querySelector('input, select, td:nth-child(2)');
          if (nextEl) {
            return nextEl.value || nextEl.innerText || '';
          }
        }
      }
      return '';
    };

    const orderNo = findMatch([
      /order\s*no[\.\:\s]*([A-Z0-9\-\/]+)/i,
      /lr\s*no[\.\:\s]*([A-Z0-9\-\/]+)/i,
      /sales\s*doc[\.\:\s]*([A-Z0-9\-\/]+)/i,
      /invoice\s*no[\.\:\s]*([A-Z0-9\-\/]+)/i
    ]) || findByLabel(['order no', 'lr no', 'invoice no']) || `JK-${Math.floor(100000 + Math.random() * 900000)}`;

    const truckNo = findMatch([
      /vehicle\s*no[\.\:\s]*([A-Z0-9\s\-]+)/i,
      /truck\s*no[\.\:\s]*([A-Z0-9\s\-]+)/i,
      /lorry\s*no[\.\:\s]*([A-Z0-9\s\-]+)/i
    ]) || findByLabel(['vehicle', 'truck', 'lorry']) || 'HR63E9632';

    const consignee = findMatch([
      /customer[\.\:\s]*([A-Za-z0-9\s\.\,\-]+)/i,
      /consignee[\.\:\s]*([A-Za-z0-9\s\.\,\-]+)/i,
      /party[\.\:\s]*([A-Za-z0-9\s\.\,\-]+)/i
    ]) || findByLabel(['customer', 'consignee', 'party']) || 'JK CEMENT WORKS';

    const destination = findMatch([
      /city[\.\:\s]*([A-Za-z\s]+)/i,
      /destination[\.\:\s]*([A-Za-z\s]+)/i,
      /county[\.\:\s]*([A-Za-z\s]+)/i
    ]) || findByLabel(['destination', 'city', 'district']) || 'HISAR';

    const qty = findMatch([
      /billed\s*qty[\.\:\s]*([\d\.]+)/i,
      /quantity[\.\:\s]*([\d\.]+)/i,
      /bags[\.\:\s]*([\d\.]+)/i,
      /sales\s*quantity[\.\:\s]*([\d\.]+)/i
    ]) || findByLabel(['quantity', 'qty', 'weight', 'bags']) || '42';

    const freight = findMatch([
      /total\s*freight[\.\:\s]*([\d\.]+)/i,
      /total\s*fright[\.\:\s]*([\d\.]+)/i,
      /freight\s*amount[\.\:\s]*([\d\.]+)/i
    ]) || findByLabel(['total freight', 'freight']) || '25200';

    const date = findMatch([
      /billing\s*date[\.\:\s]*([\d\.\-\/]+)/i,
      /date[\.\:\s]*([\d\.\-\/]+)/i
    ]) || new Date().toISOString().split('T')[0];

    const billedQtyNum = parseFloat(qty) || 42;
    const freightNum = parseFloat(freight) || 25200;
    const ratePMT = billedQtyNum > 0 ? Math.round(freightNum / billedQtyNum) : 600;

    return {
      type: 'JK_Super',
      brand: 'jksuper',
      lrNo: orderNo,
      date,
      truckNo,
      consigneeName: consignee,
      destination,
      billedQty: billedQtyNum,
      ratePMT,
      freightAmount: freightNum,
      remarks: `Extracted from ${window.location.host}`
    };
  }

  function triggerVoucherSync() {
    const btn = document.getElementById('vgtc-sync-action-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerText = '⏳ Syncing to VGTC...';
    }

    const payload = scrapeOrderData();
    console.log('[VGTC Extension] Scraped order payload:', payload);

    chrome.runtime.sendMessage({ action: 'CREATE_VOUCHER', payload }, (res) => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg> Sync Factory Voucher to VGTC
        `;
      }

      if (res && res.success) {
        showToast(`✓ Factory Voucher Created in VGTC! (LR #${payload.lrNo})`, '#10b981');
      } else {
        const err = (res && res.error) ? res.error : 'Sync failed. Ensure VGTC Server is running.';
        showToast(`❌ ${err}`, '#ef4444');
      }
    });
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
    setTimeout(() => toast.remove(), 4500);
  }

  // Auto inject widget after page loads
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectWidget();
  } else {
    document.addEventListener('DOMContentLoaded', injectWidget);
  }
})();
