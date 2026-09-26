/**
 * onlineAdvanceReminderService.js
 *
 * Checks all voucher collections for vouchers with an online advance (advanceOnline > 0)
 * that were created on a previous date and were NOT paid on the day they were created (isOnlinePaid !== true).
 *
 * When an overdue/pending online advance is detected:
 *   1. Sends an interactive WhatsApp reminder to the Clerk (8708032492) with a 1-click
 *      "Mark PAID" wa.me quick reply link (`https://wa.me/919996806953?text=PAID%20{voucherNo}`).
 *   2. Creates an in-app alert in the VGTC portal Notification Section (Bell icon).
 *   3. Marks the voucher with `lastAdvanceReminderDate: today` to avoid duplicate spam on the same day.
 */

const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const {
    sendEventNotification,
    getWhatsAppConfig,
    discoverBotPhoneNumber,
    getPublicActionBaseUrl
} = require('../utils/whatsappService');
const { createNotification } = require('../utils/notificationService');

function getTodayString() {
    // Returns current date in Asia/Kolkata timezone: YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function parseDateOnly(val) {
    if (!val) return null;
    if (val._seconds) return new Date(val._seconds * 1000).toISOString().slice(0, 10);
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const year = dmy[3];
        return `${year}-${month}-${day}`;
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
}

function fmtDate(d) {
    if (!d) return '—';
    try {
        const parts = String(d).split('-');
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return new Date(d).toLocaleDateString('en-IN');
    } catch (_) {
        return d;
    }
}

/**
 * Scan vouchers across all collections and send overdue reminders for unpaid online advances.
 *
 * @param {object} options
 * @param {boolean} options.forceAll If true, ignores same-day duplicate check for testing.
 */
async function checkAndSendPendingOnlineAdvanceReminders(options = {}) {
    const { forceAll = false } = options;
    const todayStr = getTodayString();
    console.log(`[AdvanceReminder] Running pending online advance check for date: ${todayStr}`);

    const cfg = await getWhatsAppConfig();
    const clerkPhone = (cfg.clerkPhone || cfg.adminPhone || '8708032492').trim();
    const botPhone = await discoverBotPhoneNumber(cfg);

    // Discover voucher collections
    let cols = [];
    if (isAvailable()) {
        try {
            const collections = await db.listCollections();
            cols = collections.map(c => c.id).filter(id => id.includes('voucher'));
        } catch (_) {}
    }
    const standardPrefixes = [
        'vouchers', 'dev_vouchers', 'prod_vouchers', 'beta_vouchers',
        'dev_jksuper_vouchers', 'dev_jklakshmi_vouchers', 'jksuper_vouchers', 'jklakshmi_vouchers'
    ];
    for (const p of standardPrefixes) {
        if (!cols.includes(p)) cols.push(p);
    }

    let totalChecked = 0;
    let remindersSent = 0;
    const sentVouchers = [];

    for (const col of cols) {
        let docs = [];
        if (!isAvailable()) {
            docs = localStore.getAll(col) || [];
        } else {
            try {
                const snap = await db.collection(col).get();
                docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (_) {
                continue;
            }
        }

        for (const v of docs) {
            const onlineAmt = parseFloat(v.advanceOnline || 0);
            if (onlineAmt <= 0) continue; // No online advance
            if (v.isOnlinePaid === true) continue; // Already paid

            totalChecked++;

            const vDate = parseDateOnly(v.date || v.createdAt);
            if (!vDate) continue;

            // Only remind if created ON OR BEFORE YESTERDAY (i.e. not paid on the day it was created)
            if (vDate >= todayStr && !forceAll) {
                // Created today — clerk has the entire creation day to pay before reminder fires next day
                continue;
            }

            // Duplicate reminder safeguard: only 1 reminder per day per voucher unless forced
            if (v.lastAdvanceReminderDate === todayStr && !forceAll) {
                continue;
            }

            const voucherIdentifier = v.voucherNo || v.entryId || v.id;

            const tplData = {
                voucherNo: voucherIdentifier,
                lrNo: v.lrNo || '—',
                date: fmtDate(vDate),
                truckNo: v.truckNo || '—',
                driverName: v.driverName || '—',
                source: v.source || 'Jharli / Plant',
                destination: v.destination || '—',
                advanceOnline: onlineAmt.toLocaleString('en-IN')
            };

            // 1. Send WhatsApp Reminder to Clerk
            if (cfg.enabled !== false && clerkPhone) {
                try {
                    await sendEventNotification('online_advance_pending_reminder', tplData, [clerkPhone]);
                    console.log(`[AdvanceReminder] WhatsApp alert sent for Voucher #${voucherIdentifier} (₹${tplData.advanceOnline}) to Clerk ${clerkPhone}`);
                } catch (sendErr) {
                    console.error(`[AdvanceReminder] Failed to send WhatsApp for Voucher #${voucherIdentifier}:`, sendErr.message);
                }
            }

            // 2. Create in-app system notification in VGTC portal
            try {
                await createNotification({
                    type: 'online_advance_pending',
                    title: `⚠️ Pending Online Advance — Voucher #${voucherIdentifier}`,
                    message: `Truck ${v.truckNo || '—'} has an unpaid online advance of ₹${tplData.advanceOnline} from ${tplData.date}. Action required: transfer & mark PAID.`,
                    status: 'Pending',
                    metadata: {
                        voucherId: v.id,
                        voucherNo: voucherIdentifier,
                        truckNo: v.truckNo,
                        amount: onlineAmt,
                        collection: col
                    }
                });
            } catch (notifErr) {
                console.error(`[AdvanceReminder] In-app notification error for Voucher #${voucherIdentifier}:`, notifErr.message);
            }

            // 3. Mark voucher record with reminder date to avoid re-spamming on the same day
            const updatePayload = {
                lastAdvanceReminderDate: todayStr,
                lastAdvanceReminderAt: new Date().toISOString(),
                advanceReminderCount: (v.advanceReminderCount || 0) + 1
            };

            if (isAvailable()) {
                try {
                    await db.collection(col).doc(v.id).update(updatePayload);
                } catch (_) {}
            } else {
                localStore.update(col, v.id, updatePayload);
            }

            remindersSent++;
            sentVouchers.push({
                voucherNo: voucherIdentifier,
                truckNo: v.truckNo,
                date: vDate,
                amount: onlineAmt,
                collection: col
            });
        }
    }

    console.log(`[AdvanceReminder] Check complete. Total unpaid scanned: ${totalChecked}, Reminders sent: ${remindersSent}`);
    return {
        status: 'ok',
        date: todayStr,
        totalChecked,
        remindersSent,
        sentVouchers
    };
}

module.exports = {
    checkAndSendPendingOnlineAdvanceReminders,
    getTodayString,
    parseDateOnly
};
