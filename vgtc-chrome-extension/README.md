# ⚡ VGTC Chrome Extension — JK Super Order & Voucher Sync

A custom Google Chrome Extension designed to automatically extract order details from the **JK Super Cement Portal** (or any logistics site) and instantly create a **Factory Voucher** in **VGTC Software**.

---

## 🚀 Features

- ⚡ **1-Click Sync Widget**: Injects a sleek floating button on JK Super cement order pages.
- 📦 **Automatic Scraping**: Reads Order/LR No, Truck No, Consignee/Customer Name, Destination, Billed Quantity, Rate PMT, and Freight Amount.
- 🔗 **Direct VGTC API Bridge**: Communicates directly with VGTC server (`http://localhost:5000/api/vouchers`).
- 🔔 **Instant Feedback**: Displays on-screen notifications upon voucher creation in VGTC.
- 📜 **Sync History Log**: Tracks all recently created vouchers in the Chrome extension popup.

---

## 🛠️ How to Install in Google Chrome (Step-by-Step)

1. Open Google Chrome and go to `chrome://extensions/` (or click **Menu > Extensions > Manage Extensions**).
2. Enable **Developer mode** in the top-right corner of the Extensions page.
3. Click **Load unpacked** in the top-left corner.
4. Select the folder:  
   `b:\VGTC Managemet\vgtc-chrome-extension`
5. Done! The **VGTC Extension** icon will appear in your Chrome toolbar.

---

## 🧪 How to Use

1. Open any **JK Super Order / Dispatch page** in Chrome.
2. Click the floating **"⚡ Sync Factory Voucher to VGTC"** button in the bottom-right corner.
3. The extension will automatically extract the order details and create a new **Factory Voucher** in your VGTC database!
