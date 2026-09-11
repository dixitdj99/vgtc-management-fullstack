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
const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const {
    sendWhatsAppMessage,
    sendEventNotification,
    lookupVehicleInfo,
    getWhatsAppConfig,
} = require('../utils/whatsappService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-IN'); } catch (_) { return d; }
}

/**
 * Find an unpaid online-advance voucher by voucherNo.
 * Scans common Firestore collection names (accounts for org prefixes).
 * Returns { voucher, colName } or null.
 */
async function findUnpaidVoucherByNo(voucherNo) {
    const searchNo = String(voucherNo).trim();

    if (!isAvailable()) {
        // LocalStore mode — scan all collections whose name contains 'voucher'
        const store = localStore._store || {};
        const cols = Object.keys(store).filter(k => k.includes('voucher'));
        // Also always include the bare name
        if (!cols.includes('vouchers')) cols.push('vouchers');

        for (const col of cols) {
            const docs = localStore.getAll(col);
            const found = docs.find(
                d => String(d.voucherNo).trim() === searchNo
                    && parseFloat(d.advanceOnline) > 0
                    && !d.isOnlinePaid
            );
            if (found) return { voucher: found, colName: col };
        }
        return null;
    }

    // Firestore — try the three common collection-name patterns
    const prefixes = ['vouchers', 'dev_vouchers', 'prod_vouchers'];
    for (const col of prefixes) {
        try {
            const snap = await db.collection(col)
                .where('voucherNo', '==', searchNo)
                .get();
            if (!snap.empty) {
                // Find the first doc that is actually an unpaid advance
                const match = snap.docs.find(d => {
                    const data = d.data();
                    return parseFloat(data.advanceOnline) > 0 && !data.isOnlinePaid;
                });
                if (match) return { voucher: { id: match.id, ...match.data() }, colName: col };
            }
        } catch (_) { /* collection may not exist */ }
    }
    return null;
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

// ─── Webhook POST ─────────────────────────────────────────────────────────────

/**
 * POST /api/whatsapp/webhook
 *
 * OpenWA sends a JSON body. Example for message.received:
 * {
 *   event: "message.received",
 *   session: "default",
 *   payload: {
 *     id: "...",
 *     body: "PAID 501",
 *     from: "918708032492@c.us",
 *     fromMe: false,
 *     type: "chat"
 *   }
 * }
 *
 * Different OpenWA versions may wrap payload differently — we handle both.
 */
// GET / OPTIONS — OpenWA "test webhook" pings the URL with a GET request.
// Return 200 so the connectivity check passes.
router.get('/', (req, res) => res.status(200).json({ ok: true, service: 'VGTC WhatsApp Webhook' }));
router.options('/', (req, res) => res.sendStatus(200));

router.post('/', async (req, res) => {
    // ACK immediately — OpenWA expects 200 quickly or it will retry
    res.sendStatus(200);

    try {
        const body    = req.body || {};
        const event   = body.event || body.type || '';
        const payload = body.payload || body.data || body;

        // Skip anything that isn't an incoming text message
        if (event && event !== 'message.received') return;
        if (payload.fromMe === true) return;

        const msgBody = (payload.body || payload.text || payload.content || '').trim();
        const from    = payload.from || payload.chatId || '';

        if (!msgBody) return;

        // ── Parse "PAID {voucherNo}" ──────────────────────────────────────────
        const matchPaid = msgBody.match(/^PAID\s+(\S+)/i);
        if (!matchPaid) {
            console.log(`[WA-Webhook] No-op message from ${from}: "${msgBody}"`);
            return;
        }

        const voucherNo = matchPaid[1].replace(/^#/, '');
        console.log(`[WA-Webhook] PAID reply for voucher ${voucherNo} from ${from}`);

        // Extract phone digits for replies
        const fromPhone = from.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');

        // ── Locate voucher ────────────────────────────────────────────────────
        const found = await findUnpaidVoucherByNo(voucherNo);
        if (!found) {
            console.warn(`[WA-Webhook] Voucher ${voucherNo} not found or already paid`);
            try {
                await sendWhatsAppMessage(
                    fromPhone,
                    `Voucher #${voucherNo} not found or already marked paid. Please check the number and try again.\n_VIKAS GOODS TRANSPORT CO._`
                );
            } catch (_) { /* best-effort reply */ }
            return;
        }

        const { voucher, colName } = found;
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
                `*Payment Confirmed — Voucher #${tplData.voucherNo}*`,
                `━━━━━━━━━━━━━━━━━━━━━━`,
                `*Truck:* ${tplData.truckNo}`,
                `*LR:* #${tplData.lrNo}`,
                `*Amount:* Rs.${tplData.advanceOnline}`,
                `*Paid On:* ${tplData.paidDate}`,
                `━━━━━━━━━━━━━━━━━━━━━━`,
                `Online advance updated in VGTC portal.`,
                `_VIKAS GOODS TRANSPORT CO. | 9416319445_`
            ].join('\n');
            await sendWhatsAppMessage(fromPhone, confirmMsg);
            console.log(`[WA-Webhook] Clerk confirmation sent to ${fromPhone}`);
        } catch (replyErr) {
            console.error('[WA-Webhook] Clerk confirmation failed:', replyErr.message);
        }

        // ── Notify owner + driver (fire-and-forget) ───────────────────────────
        ;(async () => {
            try {
                const vInfo = await lookupVehicleInfo(voucher.truckNo);
                const isSelf      = (vInfo?.ownershipType === 'self') || (voucher.ownershipType === 'self');
                const ownerPhone  = vInfo?.ownerContact  || voucher.ownerContact  || '';
                const driverPhone = vInfo?.driverContact || voucher.driverContact || '';

                if (!isSelf && ownerPhone) {
                    await sendEventNotification('online_advance_paid_owner', tplData, [ownerPhone]);
                    console.log(`[WA-Webhook] Owner notified: ${ownerPhone}`);
                }
                if (driverPhone) {
                    await sendEventNotification('online_advance_paid_driver', tplData, [driverPhone]);
                    console.log(`[WA-Webhook] Driver notified: ${driverPhone}`);
                }
            } catch (notifyErr) {
                console.error('[WA-Webhook] Owner/driver notify failed:', notifyErr.message);
            }
        })();

    } catch (err) {
        console.error('[WA-Webhook] Unhandled error:', err.message);
    }
});

module.exports = router;
