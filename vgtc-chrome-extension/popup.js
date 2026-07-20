document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const voucherTypeSelect = document.getElementById('voucherType');
  const authTokenInput = document.getElementById('authToken');
  const saveBtn = document.getElementById('saveBtn');
  const scrapeActiveTabBtn = document.getElementById('scrapeActiveTabBtn');
  const msgBox = document.getElementById('msgBox');
  const historyList = document.getElementById('historyList');
  const connStatus = document.getElementById('connStatus');

  // Load saved settings
  chrome.storage.sync.get(['vgtcApiUrl', 'vgtcToken', 'vgtcVoucherType'], (res) => {
    if (res.vgtcApiUrl) apiUrlInput.value = res.vgtcApiUrl;
    if (res.vgtcToken) authTokenInput.value = res.vgtcToken;
    if (res.vgtcVoucherType) voucherTypeSelect.value = res.vgtcVoucherType;
    testConn(apiUrlInput.value, authTokenInput.value);
  });

  // Load history
  loadHistory();

  // Save settings handler
  saveBtn.addEventListener('click', () => {
    const apiUrl = apiUrlInput.value.trim();
    const token = authTokenInput.value.trim();
    const vType = voucherTypeSelect.value;

    chrome.storage.sync.set(
      {
        vgtcApiUrl: apiUrl,
        vgtcToken: token,
        vgtcVoucherType: vType,
      },
      () => {
        showMsg('Settings saved successfully!', 'success');
        testConn(apiUrl, token);
      }
    );
  });

  // Manual Scrape Active Tab handler
  scrapeActiveTabBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return showMsg('No active tab found', 'error');

      chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_SYNC' }, (response) => {
        if (chrome.runtime.lastError) {
          // If content script isn't injected, inject manually
          chrome.scripting.executeScript(
            {
              target: { tabId: tabs[0].id },
              files: ['content.js'],
            },
            () => {
              showMsg('Injected VGTC Sync into active page! Check page bottom-right.', 'success');
            }
          );
        } else {
          showMsg('Order sync initiated from active tab!', 'success');
        }
        setTimeout(loadHistory, 2000);
      });
    });
  });

  function testConn(url, token) {
    chrome.runtime.sendMessage({ action: 'TEST_CONNECTION', apiUrl: url, token }, (res) => {
      if (res && res.success) {
        connStatus.innerText = 'CONNECTED';
        connStatus.style.background = 'rgba(16, 185, 129, 0.15)';
        connStatus.style.color = '#10b981';
      } else {
        connStatus.innerText = 'OFFLINE';
        connStatus.style.background = 'rgba(239, 68, 68, 0.15)';
        connStatus.style.color = '#f43f5e';
      }
    });
  }

  function showMsg(msg, type = 'success') {
    msgBox.innerText = msg;
    msgBox.className = `msg-box msg-${type}`;
    msgBox.style.display = 'block';
    setTimeout(() => {
      msgBox.style.display = 'none';
    }, 3500);
  }

  function loadHistory() {
    chrome.storage.local.get(['syncHistory'], (res) => {
      const history = res.syncHistory || [];
      if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-history">No vouchers synced yet</div>';
        return;
      }
      historyList.innerHTML = history
        .map(
          (h) => `
        <div class="history-item">
          <div>
            <div style="font-weight: 800; color: #f8fafc;">LR #${h.lrNo}</div>
            <div style="color: #94a3b8; font-size: 10px;">${h.truckNo} • ${h.destination}</div>
          </div>
          <div style="text-align: right;">
            <span style="color: #10b981; font-weight: 800; font-size: 10px;">✓ VOUCHER</span>
            <div style="color: #64748b; font-size: 9px;">${h.date}</div>
          </div>
        </div>
      `
        )
        .join('');
    });
  }
});
