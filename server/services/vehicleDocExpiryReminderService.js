/**
 * vehicleDocExpiryReminderService.js
 *
 * Scans Own Fleet vehicles for document expiry dates and sends automated WhatsApp notifications:
 *   - 1 month (30 days) before expiry
 *   - 15 days before expiry
 *   - 5 days before expiry
 *   - Same day of expiry (0 days)
 *   - Same day in every month when overdue (until updated)
 *
 * Each notification includes interactive WhatsApp buttons:
 *   - [🔄 Update Date] -> Prompts user in WhatsApp to reply with the new expiry date and updates the vehicle document directly.
 *   - [⏳ Wait / Snooze] -> Acknowledges and snoozes the reminder until the next milestone.
 */

const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { broadcastToAdmins, getWhatsAppConfig } = require('../utils/whatsappService');
const { createNotification } = require('../utils/notificationService');

const DOC_DEFINITIONS = [
    { key: 'insurance', label: 'Insurance Coverage', aliases: ['insurance', 'ins'] },
    { key: 'fitness', label: 'Fitness Certificate', aliases: ['fitness', 'fit'] },
    { key: 'pollution', label: 'Pollution (PUC)', aliases: ['pollution', 'puc'] },
    { key: 'national_permit', label: 'National Permit', aliases: ['nationalPermitDate', 'nationalPermit', 'permit'] },
    { key: 'permit_local', label: 'Local Permit', aliases: ['permitLocal'] },
    { key: 'tax', label: 'Road Tax', aliases: ['tax', 'roadTax'] },
    { key: 'rc', label: 'Registration (RC)', aliases: ['regDate', 'rc'] }
];

function getTodayString() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function fmtDate(d) {
    if (!d) return '—';
    try {
        const parts = String(d).trim().split(/[-/.]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`; // YYYY-MM-DD
            if (parts[2].length === 4) return `${parts[0]}/${parts[1]}/${parts[2]}`; // DD-MM-YYYY
        }
        return new Date(d).toLocaleDateString('en-IN');
    } catch (_) {
        return d;
    }
}

function parseDate(val) {
    if (!val) return null;
    if (val._seconds) return new Date(val._seconds * 1000);
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const str = String(val).trim();
    if (!str) return null;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = new Date(str.slice(0, 10) + 'T00:00:00+05:30');
        return isNaN(d.getTime()) ? null : d;
    }
    // DD.MM.YYYY, DD/MM/YYYY, or DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const year = dmy[3];
        const d = new Date(`${year}-${month}-${day}T00:00:00+05:30`);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function getDaysDifference(expiryDate) {
    const todayStr = getTodayString();
    const today = new Date(`${todayStr}T00:00:00+05:30`);
    const expStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(expiryDate);
    const exp = new Date(`${expStr}T00:00:00+05:30`);
    const diffMs = exp.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function shouldAlert(daysDiff, expiryDate) {
    // 1 month (30 days)
    if (daysDiff === 30 || daysDiff === 31) {
        return { alert: true, reason: '30_days', label: 'Expiring in 30 days (1 Month)', urgency: 'warning' };
    }
    // 15 days
    if (daysDiff === 15) {
        return { alert: true, reason: '15_days', label: 'Expiring in 15 days', urgency: 'warning' };
    }
    // 5 days
    if (daysDiff === 5) {
        return { alert: true, reason: '5_days', label: 'Expiring in 5 days (Urgent)', urgency: 'urgent' };
    }
    // Same day (0 days)
    if (daysDiff === 0) {
        return { alert: true, reason: 'same_day', label: 'EXPIRES TODAY!', urgency: 'critical' };
    }
    // Overdue: same day in every month until updated
    if (daysDiff < 0) {
        const todayStr = getTodayString();
        const today = new Date(`${todayStr}T00:00:00+05:30`);
        const expDay = expiryDate.getDate();
        const todayDay = today.getDate();

        // Last day of current month
        const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const isSameDayOfMonth = (todayDay === expDay) || (expDay > lastDayOfCurrentMonth && todayDay === lastDayOfCurrentMonth);

        if (isSameDayOfMonth) {
            const monthsOverdue = Math.max(1, Math.round(Math.abs(daysDiff) / 30.4));
            return {
                alert: true,
                reason: 'monthly_overdue',
                label: `OVERDUE by ${Math.abs(daysDiff)} days (${monthsOverdue} month${monthsOverdue > 1 ? 's' : ''} overdue)`,
                urgency: 'critical',
                monthsOverdue
            };
        }
    }

    return { alert: false };
}

function isOwnFleet(v) {
    if (!v) return false;
    const ownership = String(v.ownershipType || '').toLowerCase();
    const ownerName = String(v.ownerName || '').toLowerCase();
    return ownership === 'self' || ownership === 'own' || v.isSelf === true || ownerName.includes('vikas transport');
}

/**
 * Scan all own vehicles and send expiry notifications.
 *
 * @param {object} options
 * @param {boolean} options.forceAll If true, ignores same-day duplicate check for testing.
 */
async function checkAndSendVehicleDocExpiryReminders(options = {}) {
    const { forceAll = false } = options;
    const todayStr = getTodayString();
    console.log(`[DocExpiryReminder] Running own fleet document expiry check for date: ${todayStr}`);

    const cols = ['vehicles', 'dev_vehicles', 'prod_vehicles'];
    let totalVehiclesChecked = 0;
    let alertsSent = 0;
    const alertedItems = [];

    for (const colName of cols) {
        let vehicles = [];
        if (!isAvailable()) {
            vehicles = localStore.getAll(colName) || [];
        } else {
            try {
                const snap = await db.collection(colName).get();
                vehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (err) {
                console.error(`[DocExpiryReminder] Failed to read ${colName}:`, err.message);
                continue;
            }
        }

        const ownVehicles = vehicles.filter(isOwnFleet);
        totalVehiclesChecked += ownVehicles.length;

        for (const v of ownVehicles) {
            let docs = {};
            try {
                if (typeof v.docs === 'object' && v.docs !== null) {
                    docs = v.docs;
                } else if (typeof v.docs === 'string' && v.docs.trim()) {
                    docs = JSON.parse(v.docs);
                }
            } catch (_) {}

            const history = v.docReminderHistory || {};
            let historyUpdated = false;

            for (const def of DOC_DEFINITIONS) {
                // Find date in docs object or top-level fields
                let rawDate = docs[def.key] || v[def.key];
                if (!rawDate) {
                    for (const alias of def.aliases) {
                        if (docs[alias] || v[alias]) {
                            rawDate = docs[alias] || v[alias];
                            break;
                        }
                    }
                }

                if (!rawDate) continue;
                const parsedDate = parseDate(rawDate);
                if (!parsedDate) continue;

                const daysDiff = getDaysDifference(parsedDate);
                const alertCheck = shouldAlert(daysDiff, parsedDate);

                if (!alertCheck.alert) continue;

                // Check if already sent today for this document
                const lastSent = history[def.key]?.lastSentDate;
                if (!forceAll && lastSent === todayStr) {
                    continue; // Skip duplicate on the same day
                }

                console.log(`[DocExpiryReminder] Triggering ${alertCheck.reason} for ${v.truckNo} - ${def.label} (Days diff: ${daysDiff})`);

                const formattedExpiry = fmtDate(rawDate);
                const isOverdue = alertCheck.reason === 'monthly_overdue';

                const alertMsg = [
                    `*VIKAS GOODS TRANSPORT CO.* 🚨`,
                    `*FLEET DOCUMENT ${isOverdue ? 'OVERDUE' : 'EXPIRY'} ALERT*`,
                    ``,
                    `🚚 *Truck:* ${v.truckNo} (Own Fleet)`,
                    `📄 *Document:* ${def.label}`,
                    `🗓️ *Expiry Date:* ${formattedExpiry}`,
                    `⚠️ *Status:* *${alertCheck.label}*`,
                    ``,
                    isOverdue
                        ? `❌ This document is expired and needs immediate renewal!`
                        : `Please renew this document or update the records in the portal.`
                ].join('\n');

                const buttons = [
                    { id: `DOC_EXP_UPDATE_${v.id}_${def.key}`, text: '🔄 Update Date' },
                    { id: `DOC_EXP_WAIT_${v.id}_${def.key}`, text: '⏳ Wait / Snooze' }
                ];

                try {
                    await broadcastToAdmins('DOCUMENT EXPIRY ALERT', alertMsg, buttons);
                    alertsSent++;
                    alertedItems.push({
                        truckNo: v.truckNo,
                        document: def.label,
                        expiryDate: formattedExpiry,
                        status: alertCheck.label
                    });

                    // Create in-app portal notification
                    await createNotification({
                        type: 'vehicle_doc_expiry',
                        title: `⚠️ ${def.label} ${isOverdue ? 'Overdue' : 'Expiring'} — ${v.truckNo}`,
                        message: `Truck ${v.truckNo} ${def.label} is ${alertCheck.label}. Expiry date: ${formattedExpiry}.`,
                        truckNo: v.truckNo,
                        document: def.key,
                        documentLabel: def.label,
                        expiryDate: formattedExpiry,
                        urgency: alertCheck.urgency
                    });

                    history[def.key] = {
                        lastSentDate: todayStr,
                        reason: alertCheck.reason,
                        sentAt: new Date().toISOString()
                    };
                    historyUpdated = true;
                } catch (sendErr) {
                    console.error(`[DocExpiryReminder] Failed to send alert for ${v.truckNo} ${def.label}:`, sendErr.message);
                }
            }

            if (historyUpdated) {
                try {
                    if (!isAvailable()) {
                        localStore.update(colName, v.id, { docReminderHistory: history });
                    } else {
                        await db.collection(colName).doc(v.id).update({ docReminderHistory: history });
                    }
                } catch (updateErr) {
                    console.error(`[DocExpiryReminder] Failed to save history for ${v.truckNo}:`, updateErr.message);
                }
            }
        }
    }

    console.log(`[DocExpiryReminder] Finished check: ${totalVehiclesChecked} own vehicles evaluated, ${alertsSent} alerts dispatched.`);
    return {
        today: todayStr,
        totalVehiclesChecked,
        alertsSent,
        alertedItems
    };
}

module.exports = {
    checkAndSendVehicleDocExpiryReminders,
    DOC_DEFINITIONS,
    parseDate,
    fmtDate,
    isOwnFleet
};
