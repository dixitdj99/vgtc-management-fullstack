/**
 * whatsappWebhookRoute.js
 *
 * Public (no-auth) express router for OpenWA webhook callbacks.
 *
 * Register in OpenWA dashboard:
 *   URL  : https://<your-server>/api/whatsapp/webhook
 *   Event: message.received
 *
 * When the clerk replies "PAID {voucherNo}" to the online-advance alert,
 * this handler:
 *   1. Parses the reply for the pattern /^PAID\s+(\S+)/i
 *   2. Finds the matching unpaid online-advance voucher
 *   3. Marks it isOnlinePaid = true + onlinePaidDate = today
 *   4. Sends a confirmation reply back to the clerk
 *   5. Notifies the vehicle owner (market vehicles) and driver
 *
 * Always responds 200 OK to prevent OpenWA retry storms.
 */

const express = require('express');
const router = express.Router();
const { db, isAvailable, admin } = require('../firebase');
const { getCol, getEnvCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');
const {
    sendWhatsAppMessage,
    sendWhatsAppDocument,
    sendWhatsAppButtons,
    broadcastToAdmins,
    sendEventNotification,
    lookupVehicleInfo,
    lookupVehiclePhone,
    lookupProfilePhone,
    lookupUserPhone,
    getWhatsAppConfig,
    logWhatsAppActivity,
} = require('../utils/whatsappService');
const { createNotification } = require('../utils/notificationService');
const { generateVehicleMonthlyPdf, generateVehicleMonthlyExcel, fetchVouchersForTruck, computeVoucherFinancials } = require('../services/reportService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
    if (!d) return '—';
    try {
        const parts = String(d).trim().split(/[-/.]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            if (parts[2].length === 4) return `${parts[0]}/${parts[1]}/${parts[2]}`;
        }
        return new Date(d).toLocaleDateString('en-IN');
    } catch (_) {
        return d;
    }
}

// ─── Document Update Session Store ───────────────────────────────────────────
const pendingDocUpdateSessions = new Map();

const DOC_LABEL_MAP = {
    insurance: 'Insurance Coverage',
    fitness: 'Fitness Certificate',
    pollution: 'Pollution (PUC)',
    puc: 'Pollution (PUC)',
    national_permit: 'National Permit',
    permit: 'Permit',
    permit_local: 'Local Permit',
    tax: 'Road Tax',
    rc: 'Registration (RC)'
};

/**
 * Find a vehicle by document ID or truck number
 */
async function findVehicleByIdOrTruck(idOrTruck) {
    const search = String(idOrTruck || '').trim();
    const cleanTruck = search.toUpperCase().replace(/\s/g, '');
    const cols = ['vehicles', 'dev_vehicles', 'prod_vehicles'];

    for (const col of cols) {
        if (!isAvailable()) {
            const docs = localStore.getAll(col) || [];
            const found = docs.find(v =>
                String(v.id || '').trim() === search ||
                (v.truckNo && v.truckNo.toUpperCase().replace(/\s/g, '') === cleanTruck)
            );
            if (found) return { vehicle: found, colName: col };
        } else {
            try {
                const doc = await db.collection(col).doc(search).get();
                if (doc.exists) return { vehicle: { id: doc.id, ...doc.data() }, colName: col };

                const snap = await db.collection(col).where('truckNo', '==', cleanTruck).limit(1).get();
                if (!snap.empty) return { vehicle: { id: snap.docs[0].id, ...snap.docs[0].data() }, colName: col };
            } catch (_) {}
        }
    }
    return null;
}

/**
 * Find a cashbook entry by ID or entryId in Firestore or localStore
 */
async function findCashbookEntryById(id) {
    const searchId = String(id || '').trim();
    const cols = ['cashbook', 'dev_cashbook', 'prod_cashbook'];
    for (const col of cols) {
        if (!isAvailable()) {
            const docs = localStore.getAll(col);
            const found = docs.find(d => String(d.id || '').trim() === searchId || String(d.entryId || '').trim() === searchId);
            if (found) return { entry: found, colName: col };
        } else {
            try {
                const doc = await db.collection(col).doc(searchId).get();
                if (doc.exists) return { entry: { id: doc.id, ...doc.data() }, colName: col };
                const snap = await db.collection(col).where('entryId', '==', searchId).limit(1).get();
                if (!snap.empty) return { entry: { id: snap.docs[0].id, ...snap.docs[0].data() }, colName: col };
            } catch (_) {}
        }
    }
    return null;
}

/**
 * Find a voucher record with online advance by voucherNo, entryId, lrNo, or doc ID.
 * Supports locating both unpaid vouchers and already-paid vouchers for duplicate handling.
 * Returns { voucher, colName } or null.
 */
async function findVoucherRecordByNo(voucherNo) {
    const searchNo = String(voucherNo || '').trim().replace(/^#/, '');

    if (!isAvailable()) {
        // LocalStore mode — scan all collections whose name contains 'voucher'
        const store = localStore._store || {};
        const cols = Object.keys(store).filter(k => k.includes('voucher'));
        if (!cols.includes('vouchers')) cols.push('vouchers');

        if (!searchNo) {
            let latestFound = null;
            for (const col of cols) {
                const docs = localStore.getAll(col);
                const onlineVouchers = docs.filter(d => parseFloat(d.advanceOnline) > 0);
                const unpaid = onlineVouchers.filter(d => !d.isOnlinePaid);
                const list = unpaid.length ? unpaid : onlineVouchers;
                if (list.length) {
                    const sorted = list.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
                    if (!latestFound || new Date(sorted[0].createdAt || sorted[0].date || 0) > new Date(latestFound.voucher.createdAt || latestFound.voucher.date || 0)) {
                        latestFound = { voucher: sorted[0], colName: col };
                    }
                }
            }
            return latestFound;
        }

        let paidMatch = null;
        for (const col of cols) {
            const docs = localStore.getAll(col);
            for (const d of docs) {
                const matches = (
                    String(d.id || '').trim() === searchNo ||
                    String(d.voucherNo || '').trim() === searchNo ||
                    String(d.entryId || '').trim() === searchNo ||
                    String(d.lrNo || '').trim() === searchNo
                ) && parseFloat(d.advanceOnline) > 0;

                if (matches) {
                    if (!d.isOnlinePaid) return { voucher: d, colName: col };
                    if (!paidMatch) paidMatch = { voucher: d, colName: col };
                }
            }
        }
        return paidMatch;
    }

    // Firestore — discover active collection names or fallback to known prefixes
    let cols = [];
    try {
        const collections = await db.listCollections();
        cols = collections.map(c => c.id).filter(id => id.includes('voucher'));
    } catch (_) { /* ignore listCollections permissions */ }

    const standardPrefixes = [
        'vouchers', 'dev_vouchers', 'prod_vouchers', 'beta_vouchers',
        'dev_jksuper_vouchers', 'dev_jklakshmi_vouchers', 'jksuper_vouchers', 'jklakshmi_vouchers',
        'dev_test_vouchers', 'test_vouchers'
    ];
    for (const p of standardPrefixes) {
        if (!cols.includes(p)) cols.push(p);
    }

    if (!searchNo) {
        for (const col of cols) {
            try {
                const snap = await db.collection(col).where('isOnlinePaid', '==', false).get();
                if (!snap.empty) {
                    const match = snap.docs.find(d => parseFloat(d.data().advanceOnline) > 0);
                    if (match) return { voucher: { id: match.id, ...match.data() }, colName: col };
                }
            } catch (_) {}
        }
        for (const col of cols) {
            try {
                const snap = await db.collection(col).orderBy('createdAt', 'desc').limit(5).get();
                if (!snap.empty) {
                    const match = snap.docs.find(d => parseFloat(d.data().advanceOnline) > 0);
                    if (match) return { voucher: { id: match.id, ...match.data() }, colName: col };
                }
            } catch (_) {}
        }
        return null;
    }

    const isNum = !isNaN(searchNo);
    const numVal = isNum ? Number(searchNo) : null;
    let paidMatch = null;

    for (const col of cols) {
        try {
            // 1. Direct Document ID lookup first
            const docRef = await db.collection(col).doc(searchNo).get();
            if (docRef.exists) {
                const data = docRef.data();
                if (parseFloat(data.advanceOnline) > 0) {
                    if (!data.isOnlinePaid) return { voucher: { id: docRef.id, ...data }, colName: col };
                    if (!paidMatch) paidMatch = { voucher: { id: docRef.id, ...data }, colName: col };
                }
            }

            const checkSnap = (snap) => {
                if (!snap || snap.empty) return null;
                for (const d of snap.docs) {
                    const data = d.data();
                    if (parseFloat(data.advanceOnline) > 0) {
                        if (!data.isOnlinePaid) return { voucher: { id: d.id, ...data }, colName: col };
                        if (!paidMatch) paidMatch = { voucher: { id: d.id, ...data }, colName: col };
                    }
                }
                return null;
            };

            // 2. voucherNo equality (String & Number)
            let res = checkSnap(await db.collection(col).where('voucherNo', '==', searchNo).get());
            if (res) return res;
            if (isNum) {
                res = checkSnap(await db.collection(col).where('voucherNo', '==', numVal).get());
                if (res) return res;
            }

            // 3. entryId equality (String & Number)
            res = checkSnap(await db.collection(col).where('entryId', '==', searchNo).get());
            if (res) return res;
            if (isNum) {
                res = checkSnap(await db.collection(col).where('entryId', '==', numVal).get());
                if (res) return res;
            }

            // 4. lrNo equality (String & Number)
            res = checkSnap(await db.collection(col).where('lrNo', '==', searchNo).get());
            if (res) return res;
            if (isNum) {
                res = checkSnap(await db.collection(col).where('lrNo', '==', numVal).get());
                if (res) return res;
            }

        } catch (_) { /* collection or index error */ }
    }
    return paidMatch;
}

/**
 * Mark a voucher as online-paid in the database.
 */
async function markVoucherPaid(voucherId, colName, paidDate) {
    const payload = {
        isOnlinePaid: true,
        onlinePaidDate: paidDate,
        updatedAt: new Date().toISOString(),
    };
    if (!isAvailable()) {
        localStore.update(colName, voucherId, payload);
    } else {
        await db.collection(colName).doc(voucherId).update(payload);
    }
}

/**
 * Find an LR record by lrNo, loadingNo, dailyTokenNo, or doc ID across all collections.
 */
async function findLrRecordByNo(searchNo) {
    let lrCols = [];
    if (isAvailable()) {
        try {
            const collections = await db.listCollections();
            lrCols = collections.map(c => c.id).filter(id => id.includes('loading_receipt'));
        } catch (_) {}
    }

    const standardPrefixes = [
        'jkl_loading_receipts', 'dev_jkl_loading_receipts',
        'jhajjar_loading_receipts', 'dev_jhajjar_loading_receipts',
        'kosli_loading_receipts', 'dev_kosli_loading_receipts',
        'bahadurgarh_loading_receipts', 'dev_bahadurgarh_loading_receipts',
        'loading_receipts', 'dev_loading_receipts',
        'jklakshmi_loading_receipts', 'dev_jklakshmi_loading_receipts'
    ];
    for (const p of standardPrefixes) {
        if (!lrCols.includes(p)) lrCols.push(p);
    }

    if (!searchNo) {
        for (const col of lrCols) {
            if (!isAvailable()) {
                const docs = localStore.getAll(col);
                const unLoaded = docs.filter(d => d.status !== 'Loaded');
                if (unLoaded.length) {
                    const sorted = unLoaded.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
                    return { lr: sorted[0], colName: col };
                }
            } else {
                try {
                    const snap = await db.collection(col).where('status', '!=', 'Loaded').limit(5).get();
                    if (!snap.empty) {
                        return { lr: { id: snap.docs[0].id, ...snap.docs[0].data() }, colName: col };
                    }
                } catch (_) {}
            }
        }
        return null;
    }

    const numVal = parseInt(searchNo, 10);
    const isNum = !isNaN(numVal);

    for (const col of lrCols) {
        if (!isAvailable()) {
            const docs = localStore.getAll(col);
            const match = docs.find(d => 
                String(d.lrNo || '').trim() === searchNo ||
                String(d.loadingNo || '').trim() === searchNo ||
                String(d.dailyTokenNo || '').trim() === searchNo ||
                String(d.id || '').trim() === searchNo
            );
            if (match) return { lr: match, colName: col };
        } else {
            try {
                // 1. String match lrNo
                let snap = await db.collection(col).where('lrNo', '==', searchNo).limit(1).get();
                if (!snap.empty) return { lr: { id: snap.docs[0].id, ...snap.docs[0].data() }, colName: col };

                // 2. Numeric match
                if (isNum) {
                    snap = await db.collection(col).where('lrNo', '==', numVal).limit(1).get();
                    if (!snap.empty) return { lr: { id: snap.docs[0].id, ...snap.docs[0].data() }, colName: col };

                    snap = await db.collection(col).where('loadingNo', '==', numVal).limit(1).get();
                    if (!snap.empty) return { lr: { id: snap.docs[0].id, ...snap.docs[0].data() }, colName: col };

                    snap = await db.collection(col).where('dailyTokenNo', '==', numVal).limit(1).get();
                    if (!snap.empty) return { lr: { id: snap.docs[0].id, ...snap.docs[0].data() }, colName: col };
                }

                // 3. Document ID match
                try {
                    const doc = await db.collection(col).doc(searchNo).get();
                    if (doc.exists) return { lr: { id: doc.id, ...doc.data() }, colName: col };
                } catch (_) {}
            } catch (_) {}
        }
    }
    return null;
}

/**
 * Mark LR as Loaded in Firestore or localStore
 */
async function markLrLoaded(lrId, colName) {
    const payload = {
        status: 'Loaded',
        loadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    if (!isAvailable()) {
        localStore.update(colName, lrId, payload);
    } else {
        await db.collection(colName).doc(lrId).update(payload);
    }
}

// ─── Webhook GET & POST ───────────────────────────────────────────────────────

/**
 * GET /api/whatsapp/webhook
 *
 * Meta Webhook Challenge verification handler.
 * Meta Developer Dashboard sends hub.mode, hub.verify_token, and hub.challenge.
 */
router.get('/', async (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        let expectedToken = 'vgtc_meta_verify_token_2026';
        try {
            const config = await getWhatsAppConfig(req);
            if (config?.webhookVerifyToken) {
                expectedToken = config.webhookVerifyToken.trim();
            }
        } catch (_) {}

        if (mode === 'subscribe' && (token === expectedToken || token === 'vgtc_meta_verify_token_2026')) {
            console.log('[WA-Webhook] ✅ Meta Webhook successfully verified with challenge token!');
            return res.status(200).send(challenge);
        } else {
            console.warn(`[WA-Webhook] ❌ Meta Webhook verification mismatch: received="${token}", expected="${expectedToken}"`);
            return res.sendStatus(403);
        }
    }

    return res.status(200).json({ ok: true, service: 'VGTC Meta WhatsApp Cloud API Webhook' });
});

router.options('/', (req, res) => res.sendStatus(200));

/**
 * POST /api/whatsapp/webhook
 *
 * Receives incoming WhatsApp messages & button clicks from Meta Cloud API.
 */
router.post('/', async (req, res) => {
    // ACK immediately — Meta expects 200 within 20 seconds or it retries
    res.sendStatus(200);

    try {
        const body = req.body || {};

        // 1. Meta Cloud API Payload Structure: entry[0].changes[0].value
        const entry = Array.isArray(body.entry) ? body.entry[0] : null;
        const change = entry && Array.isArray(entry.changes) ? entry.changes[0]?.value : null;
        const metaMessage = change && Array.isArray(change.messages) ? change.messages[0] : null;

        let msgBody = '';
        let from = '';

        if (metaMessage) {
            from = metaMessage.from || '';

            // Handle Meta Interactive Button click (reply buttons)
            if (metaMessage.type === 'interactive') {
                const btnReply = metaMessage.interactive?.button_reply;
                const listReply = metaMessage.interactive?.list_reply;
                msgBody = (btnReply?.id || btnReply?.title || listReply?.id || listReply?.title || '').trim();
            }
            // Handle Meta Quick-Reply template button click
            else if (metaMessage.type === 'button') {
                msgBody = (metaMessage.button?.payload || metaMessage.button?.text || '').trim();
            }
            // Handle regular text message reply
            else if (metaMessage.type === 'text') {
                msgBody = (metaMessage.text?.body || '').trim();
            }
        }

        // 2. Fallback to generic / legacy payload parsing if not Meta format
        if (!msgBody) {
            const payload = body.payload || body.data || body;
            if (payload.fromMe === true) return;

            msgBody = (
                payload.selectedButtonId ||
                payload.buttonId ||
                payload.selectedOptionId ||
                payload.selectedOption ||
                payload.body ||
                payload.text ||
                payload.content ||
                payload.caption ||
                ''
            ).trim();

            if (!from) {
                from = payload.from || payload.chatId || payload.author || '';
            }
        }

        if (!msgBody) return;

        logWhatsAppActivity({
            type: 'inbound_webhook',
            category: 'webhook_event',
            phone: from,
            status: 'received',
            title: `Webhook Message from ${from}`,
            details: msgBody.slice(0, 160)
        });

        // Skip cancellation/negative poll options
        if (/not ready/i.test(msgBody)) {
            console.log(`[WA-Webhook] User selected "Not Ready" from ${from}`);
            return;
        }
        if (/(?:later|pending)/i.test(msgBody) && !/mark\s+as\s+paid/i.test(msgBody)) {
            console.log(`[WA-Webhook] User selected "Later / Pending" from ${from}`);
            return;
        }

        // Extract phone digits for replies (handling E.164, @c.us, etc.)
        const fromPhone = String(from)
            .replace(/@c\.us$/, '')
            .replace(/@s\.whatsapp\.net$/, '')
            .replace(/@lid$/, '')
            .replace(/@g\.us$/, '')
            .replace(/\D/g, '');

        const clerkRecipient = fromPhone || from;

        // ── Parse "LOADED {lrNo}" or button/poll reply response ──────
        const isLoadedMatch = /LOADED/i.test(msgBody);

        if (isLoadedMatch) {
            let lrNo = '';
            const lrExtract = (
                msgBody.match(/^LOADED_([A-Za-z0-9_-]+)/i) ||
                msgBody.match(/LR\s*#?\s*([A-Za-z0-9_-]+)/i) ||
                msgBody.match(/(?:LOADED|MARK\s+(?:AS\s+)?LOADED)[\s:#\-_()]+(?:LR\s*#?)?([A-Za-z0-9_-]+)/i) ||
                msgBody.match(/^(?:\/reply\s+)?LOADED[\s:#\-_]+([A-Za-z0-9_-]+)/i)
            );
            if (lrExtract && lrExtract[1]) {
                lrNo = lrExtract[1].replace(/^[#()]+|[#()]+$/g, '').trim();
            }
            console.log(`[WA-Webhook] LOADED reply for LR "${lrNo || msgBody}" from ${from}`);

            const found = await findLrRecordByNo(lrNo);
            if (!found) {
                console.warn(`[WA-Webhook] LR "${lrNo}" not found`);
                try {
                    await sendWhatsAppMessage(
                        clerkRecipient,
                        `❌ Loading Receipt #${lrNo || 'specified'} was not found.\nPlease verify the LR number and try again.\n_VIKAS GOODS TRANSPORT CO._`
                    );
                } catch (_) {}
                return;
            }

            const { lr, colName } = found;

            // Check if already loaded (duplicate check)
            if (lr.status === 'Loaded') {
                console.log(`[WA-Webhook] Duplicate LOADED reply received for LR #${lr.lrNo} (Already Loaded)`);
                try {
                    const loadedTimeStr = lr.loadedAt ? fmtDate(lr.loadedAt) : 'earlier';
                    const dupMsg = [
                        `*VIKAS GOODS TRANSPORT CO.*`,
                        `⚠️ *LR #${lr.lrNo} (Truck ${lr.truckNo || '—'}) is ALREADY marked as LOADED!*`,
                        `*Token #:* ${lr.loadingNo || lr.dailyTokenNo || '—'}`,
                        `*Truck:* ${lr.truckNo || '—'}`,
                        `*Status:* Loaded (Completed: ${loadedTimeStr})`,
                        `_No duplicate action was taken._`
                    ].join('\n');
                    await sendWhatsAppMessage(clerkRecipient, dupMsg);
                } catch (_) {}
                return;
            }

            // Mark LR as Loaded
            await markLrLoaded(lr.id, colName);
            console.log(`[WA-Webhook] LR ${lr.lrNo} (${lr.id}) marked Loaded in [${colName}]`);

            const loadedDateStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', ' + fmtDate(todayString());

            // 1. Confirm back to labour sender
            try {
                const confirmMsg = [
                    `*VIKAS GOODS TRANSPORT CO.*`,
                    `*✅ Loading Confirmed — LR #${lr.lrNo}*`,
                    `*Token #:* ${lr.loadingNo || lr.dailyTokenNo || '—'} | *Truck:* ${lr.truckNo || '—'}`,
                    `*From:* ${lr.source || 'Plant / Godown'} → *To:* ${lr.destination || '—'}`,
                    `*Status:* LOADED & READY FOR DISPATCH`,
                    `*Completed:* ${loadedDateStr}`,
                    `Vehicle loading has been confirmed in VGTC portal.`
                ].join('\n');
                await sendWhatsAppMessage(clerkRecipient, confirmMsg, req);
            } catch (replyErr) {
                console.error('[WA-Webhook] Labour confirmation failed:', replyErr.message);
            }

            // 2. Create in-app system notification for VGTC portal notification section
            try {
                const tokenLabel = lr.loadingNo || lr.dailyTokenNo ? `Token #${lr.loadingNo || lr.dailyTokenNo}` : '';
                await createNotification({
                    type: 'vehicle_loaded',
                    title: `✅ Vehicle Loaded — LR #${lr.lrNo}`,
                    message: `Truck ${lr.truckNo || '—'} is LOADED & READY FOR DISPATCH. (${tokenLabel ? tokenLabel + ' · ' : ''}${lr.source || 'Plant'} → ${lr.destination || '—'}${lr.partyName ? ' · ' + lr.partyName : ''})`,
                    lrNo: lr.lrNo,
                    truckNo: lr.truckNo,
                    loadingNo: lr.loadingNo || lr.dailyTokenNo,
                    source: lr.source,
                    destination: lr.destination,
                    partyName: lr.partyName,
                    status: 'Loaded'
                }, req);
                console.log(`[WA-Webhook] In-app notification created for LR #${lr.lrNo}`);
            } catch (notifErr) {
                console.error('[WA-Webhook] Failed to create in-app notification:', notifErr.message);
            }

            return;
        }

        // ── Handle Active Document Expiry Update Session (User replying with date) ───
        if (pendingDocUpdateSessions.has(clerkRecipient)) {
            const session = pendingDocUpdateSessions.get(clerkRecipient);
            if (Date.now() <= session.expiresAt) {
                if (/^(?:cancel|abort|stop|no|exit)$/i.test(msgBody)) {
                    pendingDocUpdateSessions.delete(clerkRecipient);
                    await sendWhatsAppMessage(clerkRecipient, `❌ Document update cancelled for *${session.truckNo}* (*${session.docLabel}*).`, req);
                    return;
                }

                const { parseDate, fmtDate } = require('../services/vehicleDocExpiryReminderService');
                const parsed = parseDate(msgBody);
                if (parsed) {
                    const yyyy = parsed.getFullYear();
                    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                    const dd = String(parsed.getDate()).padStart(2, '0');
                    const newDateStr = `${yyyy}-${mm}-${dd}`;
                    const displayDate = `${dd}/${mm}/${yyyy}`;

                    const found = await findVehicleByIdOrTruck(session.vehicleId);
                    if (found) {
                        const { vehicle, colName } = found;
                        let docs = {};
                        try {
                            if (typeof vehicle.docs === 'object' && vehicle.docs !== null) {
                                docs = { ...vehicle.docs };
                            } else if (typeof vehicle.docs === 'string' && vehicle.docs.trim()) {
                                docs = JSON.parse(vehicle.docs);
                            }
                        } catch (_) {}

                        const patch = {};
                        docs[session.docKey] = newDateStr;
                        if (session.docKey === 'national_permit') {
                            docs.permit = newDateStr;
                            patch.nationalPermitDate = newDateStr;
                        } else if (session.docKey === 'rc') {
                            patch.regDate = newDateStr;
                        }
                        patch.docs = JSON.stringify(docs);

                        // Clear alert history for this document so next reminders use new date
                        const history = vehicle.docReminderHistory || {};
                        delete history[session.docKey];
                        patch.docReminderHistory = history;
                        patch.updatedAt = new Date().toISOString();

                        if (!isAvailable()) {
                            localStore.update(colName, vehicle.id, patch);
                        } else {
                            await db.collection(colName).doc(vehicle.id).update(patch);
                        }

                        // Create in-app portal notification
                        await createNotification({
                            type: 'vehicle_doc_updated',
                            title: `✅ ${session.docLabel} Updated — ${session.truckNo}`,
                            message: `Document ${session.docLabel} for truck ${session.truckNo} has been updated with new expiry date: ${displayDate}.`,
                            truckNo: session.truckNo,
                            document: session.docKey,
                            newExpiryDate: displayDate
                        });

                        await sendWhatsAppMessage(clerkRecipient,
                            `*VIKAS GOODS TRANSPORT CO.* ✅\n\n` +
                            `*Document Expiry Date Updated!*\n\n` +
                            `🚚 *Truck:* ${session.truckNo}\n` +
                            `📄 *Document:* ${session.docLabel}\n` +
                            `🗓️ *New Expiry Date:* ${displayDate}\n\n` +
                            `_The vehicle record has been updated in the VGTC portal._`, req);

                        pendingDocUpdateSessions.delete(clerkRecipient);
                        return;
                    }
                } else if (!/^(?:STAFF_|ADMIN_|LOADED|PAID|BALANCE|REPORT_)/i.test(msgBody)) {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.* ⚠️\n\n` +
                        `Invalid date format: "${msgBody}".\n\n` +
                        `Please reply with a valid date like \`25/09/2027\` or \`2027-09-25\` (or reply \`cancel\` to exit).`, req);
                    return;
                }
            } else {
                pendingDocUpdateSessions.delete(clerkRecipient);
            }
        }

        // ── Handle Document Expiry Wait / Snooze Button ───────────────
        if (/^DOC_EXP_WAIT_/i.test(msgBody)) {
            const parts = msgBody.replace(/^DOC_EXP_WAIT_/i, '').split('_');
            const vehicleId = parts[0];
            const docKey = parts.slice(1).join('_') || 'document';
            const docLabel = DOC_LABEL_MAP[docKey] || docKey.toUpperCase();

            console.log(`[WA-Webhook] User ${from} snoozed doc alert for vehicle ${vehicleId} doc ${docKey}`);
            const found = await findVehicleByIdOrTruck(vehicleId);
            const truckNo = found?.vehicle?.truckNo || 'Vehicle';

            if (found) {
                const { vehicle, colName } = found;
                const history = vehicle.docReminderHistory || {};
                history[docKey] = {
                    ...(history[docKey] || {}),
                    snoozedAt: new Date().toISOString()
                };
                if (!isAvailable()) {
                    localStore.update(colName, vehicle.id, { docReminderHistory: history });
                } else {
                    await db.collection(colName).doc(vehicle.id).update({ docReminderHistory: history });
                }
            }

            await sendWhatsAppMessage(clerkRecipient,
                `*VIKAS GOODS TRANSPORT CO.* ⏳\n\n` +
                `*Reminder Snoozed*\n\n` +
                `🚚 *Truck:* ${truckNo}\n` +
                `📄 *Document:* ${docLabel}\n\n` +
                `We will remind you again on the next milestone date.\n_VGTC Management System_`, req);
            return;
        }

        // ── Handle Document Expiry Update Date Button ─────────────────
        if (/^DOC_EXP_UPDATE_/i.test(msgBody)) {
            const parts = msgBody.replace(/^DOC_EXP_UPDATE_/i, '').split('_');
            const vehicleId = parts[0];
            const docKey = parts.slice(1).join('_') || 'document';
            const docLabel = DOC_LABEL_MAP[docKey] || docKey.toUpperCase();

            console.log(`[WA-Webhook] User ${from} initiated doc update for vehicle ${vehicleId} doc ${docKey}`);
            const found = await findVehicleByIdOrTruck(vehicleId);
            const truckNo = found?.vehicle?.truckNo || 'Vehicle';

            pendingDocUpdateSessions.set(clerkRecipient, {
                vehicleId,
                truckNo,
                docKey,
                docLabel,
                colName: found?.colName || 'vehicles',
                expiresAt: Date.now() + 30 * 60 * 1000 // 30 minutes
            });

            await sendWhatsAppMessage(clerkRecipient,
                `*VIKAS GOODS TRANSPORT CO.* 📅\n\n` +
                `*Update Document Expiry Date*\n\n` +
                `🚚 *Truck:* ${truckNo}\n` +
                `📄 *Document:* ${docLabel}\n\n` +
                `Please reply directly to this message with the *NEW expiry date* in *DD/MM/YYYY* format (e.g. \`25/09/2027\`).\n\n` +
                `_Or reply \`cancel\` to abort._`, req);
            return;
        }

        // ── Handle Staff Cashout Confirmation / Dispute Buttons ─────────
        if (/^STAFF_CONFIRM_CASHOUT_/i.test(msgBody)) {
            const cbId = msgBody.replace(/^STAFF_CONFIRM_CASHOUT_/i, '').trim();
            console.log(`[WA-Webhook] Staff confirmed cashout ${cbId} from ${from}`);
            const found = await findCashbookEntryById(cbId);
            if (found) {
                const { entry, colName } = found;
                const updateData = {
                    staffStatus: 'confirmed',
                    confirmedByStaffAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                if (!isAvailable()) {
                    localStore.update(colName, entry.id, updateData);
                } else {
                    await db.collection(colName).doc(entry.id).update(updateData);
                }
                await sendWhatsAppMessage(clerkRecipient,
                    `*VIKAS GOODS TRANSPORT CO.* ✅\n\n` +
                    `Thank you! You have confirmed the cash advance of *Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')}*.\n` +
                    `_Transaction record confirmed in VGTC portal._`, req);
            } else {
                await sendWhatsAppMessage(clerkRecipient, `✅ Cashout confirmed. Thank you!`, req);
            }
            return;
        }

        if (/^STAFF_DECLINE_CASHOUT_/i.test(msgBody)) {
            const cbId = msgBody.replace(/^STAFF_DECLINE_CASHOUT_/i, '').trim();
            console.log(`[WA-Webhook] Staff DECLINED / DISPUTED cashout ${cbId} from ${from}`);
            const found = await findCashbookEntryById(cbId);
            if (found) {
                const { entry, colName } = found;
                const updateData = {
                    staffStatus: 'disputed',
                    staffDisputeAt: new Date().toISOString(),
                    disputePendingApproval: true,
                    updatedAt: new Date().toISOString()
                };
                if (!isAvailable()) {
                    localStore.update(colName, entry.id, updateData);
                } else {
                    await db.collection(colName).doc(entry.id).update(updateData);
                }

                // 1. Acknowledge to staff
                await sendWhatsAppMessage(clerkRecipient,
                    `*VIKAS GOODS TRANSPORT CO.* ⚠️\n\n` +
                    `Your dispute for Cashout of *Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')}* has been registered.\n` +
                    `An approval request has been forwarded to Admin to verify and reverse this transaction.`, req);

                // 2. Dispatch Approval Request to ALL configured Admins
                const adminDisputeMsg = [
                    `*VIKAS GOODS TRANSPORT CO.* ⚠️`,
                    `*STAFF CASHOUT DISPUTE REQUIRING APPROVAL*`,
                    ``,
                    `Staff *${entry.entityName || 'Staff'}* has DECLINED / DISPUTED Cashout #${entry.entryId || entry.id}:`,
                    `• *Amount:* Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')}`,
                    `• *Date:* ${fmtDate(entry.date)}`,
                    `• *Remark:* ${entry.remark || '—'}`,
                    ``,
                    `Do you approve reversing this cashout, restoring staff balance, and crediting the funds back to Cashbook?`
                ].join('\n');

                const adminApprovalButtons = [
                    { id: `ADMIN_APPROVE_REVERSAL_${entry.id}`, text: '✅ Approve Reversal' },
                    { id: `ADMIN_REJECT_DISPUTE_${entry.id}`, text: '❌ Reject Dispute' }
                ];

                await broadcastToAdmins('DISPUTE APPROVAL', adminDisputeMsg, adminApprovalButtons, req);
                console.log(`[WA-Webhook] Dispute approval broadcast dispatched to admins for Cashout #${entry.id}`);
            } else {
                await sendWhatsAppMessage(clerkRecipient, `⚠️ Dispute received and logged. Admin will review.`, req);
            }
            return;
        }

        if (/^ADMIN_APPROVE_REVERSAL_/i.test(msgBody)) {
            const cbId = msgBody.replace(/^ADMIN_APPROVE_REVERSAL_/i, '').trim();
            console.log(`[WA-Webhook] Admin ${from} approved reversal for cashout ${cbId}`);
            const found = await findCashbookEntryById(cbId);
            if (!found) {
                await sendWhatsAppMessage(clerkRecipient, `❌ Cashout entry #${cbId} was not found.`, req);
                return;
            }

            const { entry, colName } = found;

            // ── RACE CONDITION LOCK: Check if already approved by another admin ────
            if (entry.reversalApprovedBy) {
                console.log(`[WA-Webhook] Cashout #${cbId} reversal was ALREADY approved by ${entry.reversalApprovedBy}`);
                await sendWhatsAppMessage(clerkRecipient,
                    `*VIKAS GOODS TRANSPORT CO.* ℹ️\n\n` +
                    `Dispute for Cashout #${entry.entryId || cbId} (Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')}) was *ALREADY approved & reversed* by Admin *${entry.reversalApprovedBy}* on ${fmtDate(entry.reversalApprovedAt)}.\n\n` +
                    `_No duplicate action required._`, req);
                return;
            }

            const approvingAdmin = clerkRecipient;
            const nowIso = new Date().toISOString();

            // 1. Mark original cashout as reversed
            const updateOriginal = {
                status: 'reversed',
                isReversed: true,
                disputePendingApproval: false,
                reversalApprovedBy: approvingAdmin,
                reversalApprovedAt: nowIso,
                updatedAt: nowIso
            };
            if (!isAvailable()) {
                localStore.update(colName, entry.id, updateOriginal);
            } else {
                await db.collection(colName).doc(entry.id).update(updateOriginal);
            }

            // 2. Remove / reverse linked profile_payments deduction to restore staff balance
            if (entry.linkedPaymentId) {
                try {
                    const payCol = isAvailable() ? (req ? getCol('profile_payments', req) : getEnvCol('profile_payments')) : 'profile_payments';
                    if (!isAvailable()) {
                        localStore.delete(payCol, entry.linkedPaymentId);
                    } else {
                        await db.collection(payCol).doc(entry.linkedPaymentId).delete();
                    }
                    console.log(`[WA-Webhook] Linked profile_payment ${entry.linkedPaymentId} deleted to restore staff balance`);
                } catch (payErr) {
                    console.error('[WA-Webhook] Failed to delete linked profile_payment:', payErr.message);
                }
            }

            // 3. Add balancing deposit entry back to Cashbook
            try {
                const depositCol = isAvailable() ? (req ? getCol('cashbook', req) : getEnvCol('cashbook')) : 'cashbook';
                const refundPayload = {
                    type: 'deposit',
                    amount: parseFloat(entry.amount || 0),
                    remark: `Reversal: Disputed staff cashout #${entry.entryId || entry.id}`,
                    orgId: entry.orgId || 'vgtc',
                    date: todayString(),
                    isRefundEntry: true,
                    originalEntryId: entry.id,
                    reversedByAdmin: approvingAdmin
                };
                if (!isAvailable()) {
                    localStore.insert(depositCol, { ...refundPayload, createdAt: nowIso });
                } else {
                    await db.collection(depositCol).add({ ...refundPayload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
                }
                console.log(`[WA-Webhook] Refund deposit of Rs.${entry.amount} added to Cashbook`);
            } catch (depErr) {
                console.error('[WA-Webhook] Failed to add refund deposit:', depErr.message);
            }

            // 4. Confirm back to approving Admin
            await sendWhatsAppMessage(clerkRecipient,
                `*VIKAS GOODS TRANSPORT CO.* ✅\n\n` +
                `*Reversal Approved & Processed!*\n` +
                `• *Cashout:* #${entry.entryId || entry.id}\n` +
                `• *Amount Restored:* Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')}\n` +
                `• *Staff:* ${entry.entityName || 'Staff'}\n\n` +
                `Money credited back to Cashbook and deduction removed from staff account.`, req);

            // 5. Notify Staff that dispute was approved
            const staffPhone = await lookupProfilePhone(entry.entityId || entry.entityName, req);
            if (staffPhone) {
                try {
                    const staffNotice = [
                        `*VIKAS GOODS TRANSPORT CO.* ✅`,
                        `*Cashout Dispute Approved*`,
                        ``,
                        `Dear *${entry.entityName || 'Staff'}*,`,
                        `Your decline request for Cashout #${entry.entryId || entry.id} (Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')}) has been APPROVED by Admin.`,
                        `The deduction has been reversed and your balance is fully restored.`
                    ].join('\n');
                    await sendWhatsAppMessage(staffPhone, staffNotice, req);
                } catch (_) {}
            }

            // 6. Broadcast notification to ALL OTHER Admins
            try {
                const waCfg = await getWhatsAppConfig(req);
                const otherAdmins = (waCfg.adminPhones || [waCfg.adminPhone]).filter(p => String(p).replace(/\D/g, '') !== String(approvingAdmin).replace(/\D/g, ''));
                if (otherAdmins.length > 0) {
                    const broadcastMsg = [
                        `*VIKAS GOODS TRANSPORT CO.* 📢`,
                        `*Dispute Resolved by Admin*`,
                        ``,
                        `Dispute for Cashout #${entry.entryId || entry.id} (Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')} - ${entry.entityName || 'Staff'}) was *APPROVED for reversal* by Admin ${approvingAdmin}.`,
                        `Funds have been credited back to Cashbook.`
                    ].join('\n');
                    for (const oAdmin of otherAdmins) {
                        await sendWhatsAppMessage(oAdmin, broadcastMsg, req).catch(() => {});
                    }
                }
            } catch (_) {}

            return;
        }

        if (/^ADMIN_REJECT_DISPUTE_/i.test(msgBody)) {
            const cbId = msgBody.replace(/^ADMIN_REJECT_DISPUTE_/i, '').trim();
            console.log(`[WA-Webhook] Admin ${from} rejected dispute for cashout ${cbId}`);
            const found = await findCashbookEntryById(cbId);
            if (!found) {
                await sendWhatsAppMessage(clerkRecipient, `❌ Cashout entry #${cbId} was not found.`, req);
                return;
            }
            const { entry, colName } = found;

            const updateReject = {
                disputeStatus: 'rejected',
                disputePendingApproval: false,
                disputeRejectedBy: clerkRecipient,
                disputeRejectedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            if (!isAvailable()) {
                localStore.update(colName, entry.id, updateReject);
            } else {
                await db.collection(colName).doc(entry.id).update(updateReject);
            }

            await sendWhatsAppMessage(clerkRecipient,
                `*VIKAS GOODS TRANSPORT CO.* ℹ️\n\n` +
                `Dispute for Cashout #${entry.entryId || entry.id} has been *Rejected*. The cashout transaction stands valid in the system.`, req);

            const staffPhone = await lookupProfilePhone(entry.entityId || entry.entityName, req);
            if (staffPhone) {
                await sendWhatsAppMessage(staffPhone,
                    `*VIKAS GOODS TRANSPORT CO.* ℹ️\n\n` +
                    `Dear *${entry.entityName || 'Staff'}*,\n` +
                    `Your dispute for Cashout #${entry.entryId || entry.id} (Rs.${parseFloat(entry.amount || 0).toLocaleString('en-IN')}) was reviewed by Admin. The transaction remains active.`, req).catch(() => {});
            }
            return;
        }

        // ── Check Greeting / Menu / Help ──────────────────────────────
        const isGreeting = /^(HI|HELLO|HEY|NAMASTE|START|MENU|HELP|BOT|OPTION|OPTIONS)\b/i.test(msgBody.trim());
        if (isGreeting) {
            const menuMsg = [
                `*VIKAS GOODS TRANSPORT CO.* 🚛`,
                `*Smart Logistics WhatsApp Assistant*`,
                ``,
                `Welcome! You can check vehicle balance, download statements, or track trips directly here:`,
                ``,
                `📌 *Quick Commands:*`,
                `• *Vehicle Balance:* Send \`BALANCE <TruckNo>\` (e.g. \`BALANCE HR55CD5678\`)`,
                `• *Pending Challans:* Send \`CHALLAN <TruckNo>\` (e.g. \`CHALLAN HR55CD5678\`)`,
                `• *PDF Statement:* Send \`REPORT <TruckNo>\` (e.g. \`REPORT HR55CD5678\`)`,
                `• *Excel Statement:* Send \`EXCEL <TruckNo>\` (e.g. \`EXCEL HR55CD5678\`)`,
                `• *Recent Trips:* Send \`TRIP <TruckNo>\` (e.g. \`TRIP HR55CD5678\`)`,
                ``,
                `💡 _Tip: You can also just type any vehicle number (e.g. HR55CD5678) directly to get the live ledger!_`
            ].join('\n');
            await sendWhatsAppMessage(clerkRecipient, menuMsg, req);
            return;
        }

        // ── Check Interactive Button Clicks for PDF / Excel Reports ───
        let buttonTruck = null;
        let isPdfButton = false;
        let isExcelButton = false;
        if (/^REPORT_PDF_/i.test(msgBody)) {
            buttonTruck = msgBody.replace(/^REPORT_PDF_/i, '').trim();
            isPdfButton = true;
        } else if (/^REPORT_EXCEL_/i.test(msgBody)) {
            buttonTruck = msgBody.replace(/^REPORT_EXCEL_/i, '').trim();
            isExcelButton = true;
        }

        // ── Parse "REPORT", "HISTORY", "STATEMENT", "PDF", "EXCEL" commands or Button Clicks ────
        const isReportMatch = isPdfButton || isExcelButton || /^(REPORT|HISTORY|STATEMENT|PDF|EXCEL)\b/i.test(msgBody.trim());
        if (isReportMatch) {
            console.log(`[WA-Webhook] REPORT request from ${from}: "${msgBody}"`);
            const truckMatch = buttonTruck || msgBody.match(/([A-Z]{2}[\s-]?\d{2}[\s-]?[A-Z]{1,2}[\s-]?\d{1,4})/i);
            const wantExcel = isExcelButton || /excel/i.test(msgBody);
            let resolvedTruck = buttonTruck || (truckMatch ? (Array.isArray(truckMatch) ? truckMatch[1] : truckMatch).replace(/\s+/g, '').toUpperCase() : null);

            // If no truck in message, look up which truck's owner/driver this phone belongs to
            if (!resolvedTruck) {
                try {
                    let docs = [];
                    if (isAvailable()) {
                        const vehicleCollections = ['vehicles', 'dev_vehicles'];
                        for (const col of vehicleCollections) {
                            try {
                                const snap = await db.collection(col).get();
                                docs = [...docs, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
                            } catch (_) {}
                        }
                    } else {
                        docs = localStore.getAll('vehicles') || [];
                    }
                    const cleanFrom = fromPhone.replace(/^91/, '');
                    const match = docs.find(v =>
                        String(v.ownerContact || '').replace(/\D/g, '').endsWith(cleanFrom) ||
                        String(v.driverContact || '').replace(/\D/g, '').endsWith(cleanFrom)
                    );
                    if (match) resolvedTruck = match.truckNo;
                } catch (lookupErr) {
                    console.error('[WA-Webhook] REPORT: vehicle lookup failed:', lookupErr.message);
                }
            }

            if (!resolvedTruck) {
                try {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.*\n\n` +
                        `❓ *Which vehicle?*\n` +
                        `Please send your request like:\n` +
                        `\`REPORT HR36AB1234\` — for PDF report\n` +
                        `\`REPORT HR36AB1234 EXCEL\` — for Excel\n` +
                        `\`HISTORY HR36AB1234\` — same as PDF\n\n` +
                        `_VGTC Management System_`, req);
                } catch (_) {}
                return;
            }

            try {
                // Determine month/year from message, e.g. "REPORT HR36AB1234 09 2026" or just current month
                const monthMatch = msgBody.match(/\b(0?[1-9]|1[0-2])\b.*\b(20\d{2})\b/);
                const month = monthMatch ? parseInt(monthMatch[1]) : null;
                const year = monthMatch ? parseInt(monthMatch[2]) : null;

                const monthName = month ? new Date(2000, month - 1, 1).toLocaleString('en-IN', { month: 'long' }) : null;
                const periodLabel = month && year ? `${monthName} ${year}` : 'Full History';

                // Acknowledge the request immediately
                await sendWhatsAppMessage(clerkRecipient,
                    `*VIKAS GOODS TRANSPORT CO.*\n` +
                    `📊 Generating ${wantExcel ? 'Excel' : 'PDF'} statement for *${resolvedTruck}* (${periodLabel})...\n` +
                    `_This may take a few seconds._`, req);

                let fileBuffer, filename, mimeType, caption;
                if (wantExcel) {
                    fileBuffer = await generateVehicleMonthlyExcel(resolvedTruck, month, year, req);
                    filename = `VGTC_${resolvedTruck}_${periodLabel.replace(/\s+/g, '_')}.xlsx`;
                    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    caption = `📊 *Vehicle Statement — ${resolvedTruck}*\n*Period:* ${periodLabel}\n_VGTC Management System_`;
                } else {
                    fileBuffer = await generateVehicleMonthlyPdf(resolvedTruck, month, year, req);
                    filename = `VGTC_${resolvedTruck}_${periodLabel.replace(/\s+/g, '_')}.pdf`;
                    mimeType = 'application/pdf';
                    caption = `📄 *Vehicle Statement — ${resolvedTruck}*\n*Period:* ${periodLabel}\n_VGTC Management System_`;
                }

                await sendWhatsAppDocument(clerkRecipient, fileBuffer, filename, mimeType, caption, req);
                console.log(`[WA-Webhook] REPORT: ${filename} sent to ${clerkRecipient}`);
            } catch (reportErr) {
                console.error('[WA-Webhook] REPORT generation/send failed:', reportErr.message);
                try {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.*\n` +
                        `❌ Report generation failed for *${resolvedTruck}*.\n` +
                        `Error: ${reportErr.message}\n_Please try again or contact support._`, req);
                } catch (_) {}
            }
            return;
        }

        // ── Parse "BALANCE", "KHATA", "HISAB", "SUMMARY", "TRIP", "STATUS", or direct Truck No ────
        const isTruckFormat = /^[A-Z]{2}[\s-]?[0-9]{1,2}[\s-]?[A-Z]{1,2}[\s-]?[0-9]{1,4}$/i.test(msgBody.trim());
        const isBalanceMatch = isTruckFormat || /^(BALANCE|KHATA|HISAB|HISSAAB|SUMMARY|STATUS|TRIP|TRIPS|VEHICLE)\b/i.test(msgBody.trim());

        if (isBalanceMatch) {
            console.log(`[WA-Webhook] BALANCE / KHATA request from ${from}: "${msgBody}"`);
            const truckMatch = msgBody.match(/([A-Z]{2}[\s-]?\d{2}[\s-]?[A-Z]{1,2}[\s-]?\d{1,4})/i);
            let resolvedTruck = truckMatch ? truckMatch[1].replace(/\s+/g, '').toUpperCase() : null;

            // If no truck in message, look up which truck this phone belongs to
            if (!resolvedTruck) {
                try {
                    let docs = [];
                    if (isAvailable()) {
                        const vehicleCollections = ['vehicles', 'dev_vehicles'];
                        for (const col of vehicleCollections) {
                            try {
                                const snap = await db.collection(col).get();
                                docs = [...docs, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
                            } catch (_) {}
                        }
                    } else {
                        docs = localStore.getAll('vehicles') || [];
                    }
                    const cleanFrom = fromPhone.replace(/^91/, '');
                    const match = docs.find(v =>
                        String(v.ownerContact || '').replace(/\D/g, '').endsWith(cleanFrom) ||
                        String(v.driverContact || '').replace(/\D/g, '').endsWith(cleanFrom)
                    );
                    if (match) resolvedTruck = match.truckNo;
                } catch (lookupErr) {
                    console.error('[WA-Webhook] BALANCE: vehicle lookup failed:', lookupErr.message);
                }
            }

            if (!resolvedTruck) {
                try {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.*\n\n` +
                        `❓ *Which vehicle?*\n` +
                        `Please send:\n` +
                        `\`BALANCE HR36AB1234\` or just \`HR36AB1234\`\n\n` +
                        `_VGTC Management System_`, req);
                } catch (_) {}
                return;
            }

            try {
                const vouchers = await fetchVouchersForTruck(resolvedTruck, null, null, req);
                const vInfo = await lookupVehicleInfo(resolvedTruck, req);

                if (!vouchers.length) {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.*\n\n` +
                        `🚚 *Vehicle:* ${resolvedTruck}\n` +
                        `⚠️ No voucher records found for this truck.\n\n` +
                        `_VGTC Management System_`, req);
                    return;
                }

                let totalGross = 0;
                let totalDiesel = 0;
                let totalCash = 0;
                let totalOnline = 0;
                let totalOtherDeduct = 0;
                let totalNet = 0;

                vouchers.forEach(v => {
                    const f = computeVoucherFinancials(v);
                    totalGross += f.gross;
                    totalDiesel += f.diesel;
                    totalCash += f.cash;
                    totalOnline += f.online;
                    totalOtherDeduct += (f.munshi + f.shortage + f.commission + f.tyrePuncture + f.tyreGreasing + f.extraCash);
                    totalNet += f.net;
                });

                const lastVoucher = vouchers[vouchers.length - 1];
                const lastDate = lastVoucher ? fmtDate(lastVoucher.date || lastVoucher.createdAt) : '—';
                const ownerDisplay = vInfo?.ownerName ? ` (Owner: ${vInfo.ownerName})` : '';

                const summaryText = [
                    `*VIKAS GOODS TRANSPORT CO.* 🚛`,
                    `*📊 Vehicle Ledger & Balance*`,
                    ``,
                    `*Truck:* ${resolvedTruck}${ownerDisplay}`,
                    `*Total Trips:* ${vouchers.length}`,
                    ``,
                    `*Gross Freight:* Rs.${Math.round(totalGross).toLocaleString('en-IN')}`,
                    `*Diesel Advance:* Rs.${Math.round(totalDiesel).toLocaleString('en-IN')}`,
                    `*Cash Advance:* Rs.${Math.round(totalCash).toLocaleString('en-IN')}`,
                    `*Online Advance:* Rs.${Math.round(totalOnline).toLocaleString('en-IN')}`,
                    `*Other Deductions:* Rs.${Math.round(totalOtherDeduct).toLocaleString('en-IN')}`,
                    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
                    `*Net Payable Balance:* *Rs.${Math.round(totalNet).toLocaleString('en-IN')}*`,
                    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
                    `*Last Trip:* Voucher #${lastVoucher.voucherNo || lastVoucher.id} (${lastDate}) → ${lastVoucher.destination || '—'}`
                ].join('\n');

                const reportButtons = [
                    { id: `REPORT_PDF_${resolvedTruck}`, text: '📄 Send PDF Report' },
                    { id: `REPORT_EXCEL_${resolvedTruck}`, text: '📊 Send Excel Report' }
                ];

                await sendWhatsAppButtons(clerkRecipient, 'VEHICLE SUMMARY', summaryText, reportButtons, req);
                console.log(`[WA-Webhook] BALANCE summary with buttons sent for ${resolvedTruck} to ${clerkRecipient}`);
            } catch (balErr) {
                console.error('[WA-Webhook] Balance computation failed:', balErr.message);
                try {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.*\n` +
                        `❌ Could not calculate balance for *${resolvedTruck}*.\n` +
                        `Error: ${balErr.message}\n_VGTC Management System_`, req);
                } catch (_) {}
            }
            return;
        }

        // ── Parse "CHALLAN", "CHALAN", "CHALLANS" commands ────
        const isChallanMatch = /^(CHALLAN|CHALAN|CHALLANS|CHALANS)\b/i.test(msgBody.trim());
        if (isChallanMatch) {
            console.log(`[WA-Webhook] CHALLAN request from ${from}: "${msgBody}"`);
            const truckMatch = msgBody.match(/([A-Z]{2}[\s-]?\d{2}[\s-]?[A-Z]{1,2}[\s-]?\d{1,4})/i);
            let resolvedTruck = truckMatch ? truckMatch[1].replace(/\s+/g, '').toUpperCase() : null;

            // If no truck specified, lookup truck by phone number
            if (!resolvedTruck) {
                try {
                    let docs = [];
                    if (isAvailable()) {
                        const vehicleCollections = ['vehicles', 'dev_vehicles'];
                        for (const col of vehicleCollections) {
                            try {
                                const snap = await db.collection(col).get();
                                docs = [...docs, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
                            } catch (_) {}
                        }
                    } else {
                        docs = localStore.getAll('vehicles') || [];
                    }
                    const cleanFrom = fromPhone.replace(/^91/, '');
                    const match = docs.find(v =>
                        String(v.ownerContact || '').replace(/\D/g, '').endsWith(cleanFrom) ||
                        String(v.driverContact || '').replace(/\D/g, '').endsWith(cleanFrom)
                    );
                    if (match) resolvedTruck = match.truckNo;
                } catch (lookupErr) {
                    console.error('[WA-Webhook] CHALLAN: vehicle lookup failed:', lookupErr.message);
                }
            }

            if (!resolvedTruck) {
                try {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.*\n\n` +
                        `❓ *Which vehicle?*\n` +
                        `Please send:\n` +
                        `\`CHALLAN HR36AB1234\` or just \`HR36AB1234\`\n\n` +
                        `_VGTC Management System_`, req);
                } catch (_) {}
                return;
            }

            try {
                const { getVehicleChallanBalances } = require('../utils/challanNotificationService');
                const result = await getVehicleChallanBalances(req?.orgId || 'vgtc', resolvedTruck);
                const vehicleBalance = (result.balances || []).find(b => b.truckNo === resolvedTruck) || {
                    truckNo: resolvedTruck,
                    openCount: 0,
                    pendingBags: 0,
                    pendingMT: 0,
                    challans: []
                };

                if (!vehicleBalance.openCount || vehicleBalance.pendingBags <= 0) {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.* 📝\n\n` +
                        `🚚 *Vehicle:* ${resolvedTruck}\n` +
                        `✅ *No Pending Challans!*\n\n` +
                        `All challans created for this vehicle have been fully loaded.\n\n` +
                        `_VGTC Management System_`, req);
                    return;
                }

                const lines = [
                    `*VIKAS GOODS TRANSPORT CO.* 📝`,
                    `*Pending Challans — ${resolvedTruck}*`,
                    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
                    `📦 *Total Pending:* ${vehicleBalance.pendingBags} Bags (${vehicleBalance.pendingMT.toFixed(2)} MT)`,
                    `📋 *Active Challans:* ${vehicleBalance.openCount}`,
                    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`
                ];

                for (const c of vehicleBalance.challans) {
                    const matStr = (c.materials || []).map(m => `${m.type}: ${m.remainingBags} Bags (${(m.remainingBags * 0.05).toFixed(2)} MT)`).join(', ');
                    lines.push(`• *Challan #${c.challanNo}* (${c.date || '—'})`);
                    lines.push(`  Load: ${matStr}`);
                    if (c.partyName && c.partyName !== '—') lines.push(`  Party: ${c.partyName}`);
                    if (c.destination && c.destination !== '—') lines.push(`  Dest: ${c.destination}`);
                    lines.push(``);
                }

                lines.push(`_Send \`BALANCE ${resolvedTruck}\` for ledger statement._`);

                await sendWhatsAppMessage(clerkRecipient, lines.join('\n'), req);
                console.log(`[WA-Webhook] CHALLAN list sent for ${resolvedTruck} to ${clerkRecipient}`);
            } catch (chalErr) {
                console.error('[WA-Webhook] Challan query failed:', chalErr.message);
                try {
                    await sendWhatsAppMessage(clerkRecipient,
                        `*VIKAS GOODS TRANSPORT CO.*\n` +
                        `❌ Could not fetch challans for *${resolvedTruck}*.\n` +
                        `Error: ${chalErr.message}\n_VGTC Management System_`, req);
                } catch (_) {}
            }
            return;
        }

        // ── Parse "PAID {voucherNo}" or button/poll reply response ────
        const isPaidMatch = /PAID/i.test(msgBody);
        if (!isPaidMatch) {
            console.log(`[WA-Webhook] No-op message from ${from}: "${msgBody}"`);
            return;
        }

        let voucherNo = '';
        const voucherExtract = (
            msgBody.match(/^PAID_([A-Za-z0-9_-]+)/i) ||
            msgBody.match(/Voucher\s*#?\s*([A-Za-z0-9_-]+)/i) ||
            msgBody.match(/(?:PAID|MARK\s+(?:AS\s+)?PAID)[\s:#\-_()]+(?:Voucher\s*#?)?([A-Za-z0-9_-]+)/i) ||
            msgBody.match(/^(?:\/reply\s+)?PAID[\s:#\-_]+([A-Za-z0-9_-]+)/i)
        );
        if (voucherExtract && voucherExtract[1]) {
            voucherNo = voucherExtract[1].replace(/^[#()]+|[#()]+$/g, '').trim();
        }
        console.log(`[WA-Webhook] PAID reply for voucher "${voucherNo || msgBody}" from ${from}`);

        // ── Locate voucher ────────────────────────────────────────────────────
        const found = await findVoucherRecordByNo(voucherNo);
        if (!found) {
            console.warn(`[WA-Webhook] Voucher "${voucherNo}" not found`);
            try {
                await sendWhatsAppMessage(
                    clerkRecipient,
                    `❌ Voucher #${voucherNo || 'specified'} was not found.\nPlease verify the voucher number and try again.\n_VIKAS GOODS TRANSPORT CO._`
                );
            } catch (_) { /* best-effort reply */ }
            return;
        }

        const { voucher, colName } = found;

            // ── Check if ALREADY PAID (Duplicate reply handler) ───────────────────
            if (voucher.isOnlinePaid) {
                console.log(`[WA-Webhook] Duplicate PAID reply received for voucher #${voucher.voucherNo || voucherNo} (Already Paid)`);
                try {
                    const paidDateStr = voucher.onlinePaidDate ? fmtDate(voucher.onlinePaidDate) : 'earlier';
                    const duplicateMsg = [
                        `*VIKAS GOODS TRANSPORT CO.*`,
                        `⚠️ *Voucher #${voucher.voucherNo || voucherNo} is ALREADY marked as PAID!*`,
                        `*Truck:* ${voucher.truckNo || '—'} | *LR:* #${voucher.lrNo || '—'}`,
                        `*Amount:* Rs.${parseFloat(voucher.advanceOnline || 0).toFixed(0)}`,
                        `*Paid On:* ${paidDateStr}`,
                        `_No duplicate payment action was taken._`
                    ].join('\n');
                    await sendWhatsAppMessage(clerkRecipient, duplicateMsg, req);
                } catch (_) { /* best-effort reply */ }
                return; // ABORT! Do not perform any further action or send duplicate owner/driver alerts!
            }

            const paidDate = todayString();

            // ── Mark paid ─────────────────────────────────────────────────────────
            await markVoucherPaid(voucher.id, colName, paidDate);
            console.log(`[WA-Webhook] Voucher ${voucherNo} (${voucher.id}) marked paid in [${colName}]`);

            const tplData = {
                voucherNo:     voucher.voucherNo || voucherNo,
                lrNo:          voucher.lrNo          || '—',
                truckNo:       voucher.truckNo        || '—',
                driverName:    voucher.driverName     || '—',
                destination:   voucher.destination    || '—',
                advanceOnline: parseFloat(voucher.advanceOnline || 0).toFixed(0),
                paidDate:      fmtDate(paidDate),
            };

            // ── Confirm back to clerk ─────────────────────────────────────────────
            try {
                const confirmMsg = [
                    `*VIKAS GOODS TRANSPORT CO.*`,
                    `*✅ Payment Confirmed — Voucher #${tplData.voucherNo}*`,
                    `*Truck:* ${tplData.truckNo} | *LR:* #${tplData.lrNo}`,
                    `*Amount:* Rs.${tplData.advanceOnline} | *Paid On:* ${tplData.paidDate}`,
                    `Online advance marked PAID in VGTC portal.`
                ].join('\n');
                await sendWhatsAppMessage(clerkRecipient, confirmMsg, req);
                console.log(`[WA-Webhook] Clerk confirmation sent to ${clerkRecipient}`);
            } catch (replyErr) {
                console.error('[WA-Webhook] Clerk confirmation failed:', replyErr.message);
            }

        // ── Notify owner + driver (fire-and-forget) ───────────────────────────
        ;(async () => {
            try {
                const vInfo = await lookupVehicleInfo(voucher.truckNo, req);
                const isSelf      = (vInfo?.ownershipType === 'self') || (voucher.ownershipType === 'self');
                const ownerPhone  = vInfo?.ownerContact  || voucher.ownerContact  || '';
                const driverPhone = vInfo?.driverContact || voucher.driverContact || '';

                if (!isSelf && ownerPhone) {
                    await sendEventNotification('online_advance_paid_owner', tplData, [ownerPhone], req);
                    console.log(`[WA-Webhook] Owner notified: ${ownerPhone}`);
                }
                if (driverPhone) {
                    await sendEventNotification('online_advance_paid_driver', tplData, [driverPhone], req);
                    console.log(`[WA-Webhook] Driver notified: ${driverPhone}`);
                }

                // ── Notify creator of voucher / LR (fire-and-forget) ──────────
                let creatorPhone = voucher.creatorPhone || '';
                if (!creatorPhone && (voucher.createdBy || voucher.createdByName)) {
                    creatorPhone = await lookupUserPhone(voucher.createdBy || voucher.createdByName, req);
                }

                // If voucher has an LR number and still no creator phone, check LR records
                if (!creatorPhone && voucher.lrNo) {
                    try {
                        const lrCols = [
                            'loading_receipts', 'jklakshmi_loading_receipts',
                            'jhajjar_loading_receipts', 'kosli_loading_receipts', 'bahadurgarh_loading_receipts',
                            'dev_loading_receipts', 'dev_jklakshmi_loading_receipts',
                            'dev_jhajjar_loading_receipts', 'dev_kosli_loading_receipts', 'dev_bahadurgarh_loading_receipts'
                        ];
                        for (const col of lrCols) {
                            let matchDoc = null;
                            if (!isAvailable()) {
                                const docs = localStore.getAll(col);
                                matchDoc = docs.find(d => String(d.lrNo || '').trim() === String(voucher.lrNo).trim());
                            } else {
                                const snap = await db.collection(col).where('lrNo', '==', String(voucher.lrNo)).limit(1).get();
                                if (!snap.empty) matchDoc = snap.docs[0].data();
                            }
                            if (matchDoc) {
                                creatorPhone = matchDoc.creatorPhone || await lookupUserPhone(matchDoc.createdBy || matchDoc.createdByName, req);
                                if (creatorPhone) break;
                            }
                        }
                    } catch (_) {}
                }

                const targetCreatorPhones = [];
                if (creatorPhone) targetCreatorPhones.push(creatorPhone);
                const cfg = await getWhatsAppConfig(req);
                if (cfg?.adminPhone && !targetCreatorPhones.includes(cfg.adminPhone)) {
                    targetCreatorPhones.push(cfg.adminPhone);
                }

                if (targetCreatorPhones.length) {
                    await sendEventNotification('voucher_action_creator', tplData, targetCreatorPhones, req);
                    console.log(`[WA-Webhook] Creator notified: ${targetCreatorPhones.join(', ')}`);
                }
            } catch (notifyErr) {
                console.error('[WA-Webhook] Notification failed:', notifyErr.message);
            }
        })();

    } catch (err) {
        console.error('[WA-Webhook] Unhandled error:', err.message);
    }
});

module.exports = router;
module.exports.findVoucherRecordByNo = findVoucherRecordByNo;
module.exports.markVoucherPaid = markVoucherPaid;
module.exports.findLrRecordByNo = findLrRecordByNo;
module.exports.markLrLoaded = markLrLoaded;
module.exports.todayString = todayString;
module.exports.fmtDate = fmtDate;

