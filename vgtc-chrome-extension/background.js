// VGTC Extension Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VGTC Extension] Installed successfully.');
  // Set default settings
  chrome.storage.sync.get(['vgtcApiUrl'], (res) => {
    if (!res.vgtcApiUrl) {
      chrome.storage.sync.set({
        vgtcApiUrl: 'http://localhost:5000/api',
        vgtcToken: '',
        vgtcVoucherType: 'JK_Super'
      });
    }
  });
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CREATE_VOUCHER') {
    handleCreateVoucher(request.payload)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === 'TEST_CONNECTION') {
    handleTestConnection(request.apiUrl, request.token)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleCreateVoucher(payload) {
  const settings = await new Promise((resolve) => {
    chrome.storage.sync.get(['vgtcApiUrl', 'vgtcToken', 'vgtcVoucherType'], resolve);
  });

  const apiUrl = (settings.vgtcApiUrl || 'http://localhost:5000/api').replace(/\/+$/, '');
  const token = settings.vgtcToken || '';
  const voucherType = settings.vgtcVoucherType || 'JK_Super';

  const fullPayload = {
    type: payload.type || voucherType,
    brand: payload.brand || 'jksuper',
    lrNo: payload.lrNo || payload.orderNo || `JK-${Date.now().toString().slice(-6)}`,
    date: payload.date || new Date().toISOString().split('T')[0],
    truckNo: payload.truckNo || 'HR-63-TEMP',
    consigneeName: payload.consigneeName || payload.party || 'JK CEMENT WORKS',
    destination: payload.destination || 'HISAR',
    billedQty: parseFloat(payload.billedQty || payload.bags || payload.qty) || 0,
    ratePMT: parseFloat(payload.ratePMT || payload.rate) || 0,
    freightAmount: parseFloat(payload.freightAmount || payload.totalFreight) || 0,
    remarks: payload.remarks || 'Auto-created via VGTC Chrome Extension from JK Super Portal',
  };

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${apiUrl}/vouchers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(fullPayload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || `HTTP ${response.status} Failed`);
  }

  const result = await response.json();

  // Save to sync history
  chrome.storage.local.get(['syncHistory'], (res) => {
    const history = res.syncHistory || [];
    history.unshift({
      id: Date.now(),
      lrNo: fullPayload.lrNo,
      truckNo: fullPayload.truckNo,
      destination: fullPayload.destination,
      date: new Date().toLocaleTimeString(),
      status: 'SUCCESS',
    });
    chrome.storage.local.set({ syncHistory: history.slice(0, 50) });
  });

  return result;
}

async function handleTestConnection(apiUrl, token) {
  const url = (apiUrl || 'http://localhost:5000/api').replace(/\/+$/, '');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${url}/public/org`, { headers });
  if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
  return await res.json();
}
