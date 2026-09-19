/**
 * quickActionRoutes.js
 *
 * Public routes for 1-Click WhatsApp confirmations:
 *   - GET /api/action/paid/:voucherNo  → Mark online advance as PAID
 *   - GET /api/action/loaded/:lrNo     → Mark LR as LOADED
 *
 * Provides instant 1-tap confirmation directly from WhatsApp links
 * with OpenGraph meta tags so WhatsApp previews display "✅ Mark as PAID"
 * instead of the default generic "Start Chatting" button.
 */

const express = require('express');
const router = express.Router();
const {
    findVoucherRecordByNo,
    markVoucherPaid,
    findLrRecordByNo,
    markLrLoaded,
    todayString,
    fmtDate
} = require('./whatsappWebhookRoute');
const {
    sendWhatsAppMessage,
    sendEventNotification,
    lookupVehicleInfo,
    getWhatsAppConfig
} = require('../utils/whatsappService');
const { createNotification } = require('../utils/notificationService');

// Check if request is an automated link-preview crawler (WhatsApp, Facebook, Twitter, Slack, etc.)
function isLinkCrawler(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    return /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|bot|crawler|spider|preview/i.test(ua);
}

function renderHtmlResponse({ title, ogTitle, ogDesc, statusBadge, heading, message, details = [], isSuccess = true }) {
    const badgeBg = isSuccess ? '#16a34a' : '#d97706';
    const accentColor = isSuccess ? '#22c55e' : '#f59e0b';
    const detailRows = details.map(d => `
        <div class="row">
            <span class="label">${d.label}</span>
            <span class="val">${d.val}</span>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${title}</title>
    <meta property="og:title" content="${ogTitle || title}">
    <meta property="og:description" content="${ogDesc || ''}">
    <meta property="og:site_name" content="Vikas Goods Transport Co.">
    <meta name="theme-color" content="#0f172a">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background: #0b0f19; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
        .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 20px; max-width: 440px; width: 100%; padding: 28px 24px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .icon-circle { width: 68px; height: 68px; border-radius: 50%; background: ${isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${accentColor}; display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 16px; border: 2px solid ${accentColor}; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: ${badgeBg}; color: #ffffff; margin-bottom: 12px; }
        h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #f8fafc; }
        p.sub { font-size: 14px; color: #94a3b8; margin-bottom: 20px; line-height: 1.5; }
        .details-box { background: #0b0f19; border: 1px solid #1e293b; border-radius: 14px; padding: 14px 16px; margin-bottom: 24px; text-align: left; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #1e293b; font-size: 13px; }
        .row:last-child { border-bottom: none; }
        .label { color: #64748b; font-weight: 500; }
        .val { color: #f1f5f9; font-weight: 600; text-align: right; }
        .btn-close { display: block; width: 100%; padding: 12px; background: #1e293b; color: #cbd5e1; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; }
        .btn-close:hover { background: #334155; color: #fff; }
        .footer { margin-top: 20px; font-size: 11px; color: #475569; letter-spacing: 0.5px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon-circle">${isSuccess ? '✓' : 'ℹ'}</div>
        <span class="badge">${statusBadge}</span>
        <h1>${heading}</h1>
        <p class="sub">${message}</p>
        ${detailRows ? `<div class="details-box">${detailRows}</div>` : ''}
        <button class="btn-close" onclick="window.close();">Close Window</button>
        <div class="footer">VIKAS GOODS TRANSPORT CO.</div>
    </div>
</body>
</html>`;
}

// ─── 1. Mark Online Advance as PAID ───────────────────────────────────────────
// GET /api/action/paid/:voucherNo
router.get('/paid/:voucherNo', async (req, res) => {
    const voucherNo = req.params.voucherNo;
    console.log(`[QuickAction] PAID request for Voucher "${voucherNo}" (Crawler: ${isLinkCrawler(req)})`);

    const found = await findVoucherRecordByNo(voucherNo);
    if (!found) {
        return res.status(404).send(renderHtmlResponse({
            title: `Voucher #${voucherNo} Not Found`,
            ogTitle: `❌ Voucher #${voucherNo} Not Found`,
            ogDesc: 'Please verify the voucher number.',
            statusBadge: 'NOT FOUND',
            heading: 'Voucher Not Found',
            message: `Voucher #${voucherNo} could not be located in VGTC records.`,
            isSuccess: false
        }));
    }

    const { voucher, colName } = found;
    const vId = voucher.voucherNo || voucher.entryId || voucherNo;
    const onlineAmt = parseFloat(voucher.advanceOnline || 0).toLocaleString('en-IN');

    // If request comes from link-preview crawler, return metadata without performing mutation
    if (isLinkCrawler(req)) {
        return res.send(renderHtmlResponse({
            title: `Mark PAID — Voucher #${vId}`,
            ogTitle: `✅ Mark as PAID — Voucher #${vId} (₹${onlineAmt})`,
            ogDesc: `Truck: ${voucher.truckNo || '—'} · Tap to confirm online advance payment`,
            statusBadge: 'ACTION REQUIRED',
            heading: 'Confirm Payment',
            message: `Tap below to mark online advance of ₹${onlineAmt} as PAID for Truck ${voucher.truckNo || '—'}.`,
            details: [
                { label: 'Voucher No.', val: `#${vId}` },
                { label: 'Truck No.', val: voucher.truckNo || '—' },
                { label: 'Advance Online', val: `₹${onlineAmt}` }
            ]
        }));
    }

    // Already Paid Handler
    if (voucher.isOnlinePaid) {
        return res.send(renderHtmlResponse({
            title: `Voucher #${vId} Already Paid`,
            ogTitle: `✓ Voucher #${vId} Already Paid`,
            ogDesc: `Payment of ₹${onlineAmt} already recorded.`,
            statusBadge: 'ALREADY PAID',
            heading: 'Payment Already Recorded',
            message: `Voucher #${vId} is already marked as PAID in the VGTC portal.`,
            details: [
                { label: 'Voucher No.', val: `#${vId}` },
                { label: 'Truck No.', val: voucher.truckNo || '—' },
                { label: 'Paid Amount', val: `₹${onlineAmt}` },
                { label: 'Status', val: 'PAID' }
            ],
            isSuccess: true
        }));
    }

    // Execute Payment
    const paidDate = todayString();
    await markVoucherPaid(voucher.id, colName, paidDate);
    console.log(`[QuickAction] Voucher ${vId} marked PAID via 1-click action link!`);

    const cfg = await getWhatsAppConfig();
    const clerkRecipient = (cfg.clerkPhone || cfg.adminPhone || '8708032492').trim();

    const tplData = {
        voucherNo:     vId,
        lrNo:          voucher.lrNo          || '—',
        truckNo:       voucher.truckNo        || '—',
        driverName:    voucher.driverName     || '—',
        destination:   voucher.destination    || '—',
        advanceOnline: onlineAmt,
        paidDate:      fmtDate(paidDate)
    };

    // 1. Send confirmation WhatsApp message to Clerk
    try {
        const confirmMsg = [
            `*Payment Confirmed — Voucher #${tplData.voucherNo}*`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
            `*Truck:* ${tplData.truckNo}`,
            `*LR:* #${tplData.lrNo}`,
            `*Amount:* Rs.${tplData.advanceOnline}`,
            `*Paid On:* ${tplData.paidDate}`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
            `Online advance updated in VGTC portal via 1-Click link.`,
            `_VIKAS GOODS TRANSPORT CO. | 9416319445_`
        ].join('\n');
        await sendWhatsAppMessage(clerkRecipient, confirmMsg);
    } catch (_) {}

    // 2. Notify owner + driver
    (async () => {
        try {
            const vInfo = await lookupVehicleInfo(voucher.truckNo);
            const isSelf = (vInfo?.ownershipType === 'self') || (voucher.ownershipType === 'self');
            const ownerPhone = vInfo?.ownerContact || voucher.ownerContact || '';
            const driverPhone = vInfo?.driverContact || voucher.driverContact || '';

            if (!isSelf && ownerPhone) {
                await sendEventNotification('online_advance_paid_owner', tplData, [ownerPhone]);
            }
            if (driverPhone) {
                await sendEventNotification('online_advance_paid_driver', tplData, [driverPhone]);
            }
        } catch (_) {}
    })();

    // 3. Create in-app portal notification
    try {
        await createNotification({
            type: 'online_advance_paid',
            title: `✅ Online Advance Paid — Voucher #${vId}`,
            message: `Truck ${tplData.truckNo} online advance of ₹${tplData.advanceOnline} marked as PAID.`,
            status: 'Paid',
            metadata: {
                voucherId: voucher.id,
                voucherNo: vId,
                truckNo: tplData.truckNo,
                amount: tplData.advanceOnline,
                collection: colName
            }
        });
    } catch (_) {}

    // Render Success Screen
    return res.send(renderHtmlResponse({
        title: `Payment Confirmed — Voucher #${vId}`,
        ogTitle: `✅ Voucher #${vId} Marked as PAID`,
        ogDesc: `Payment of ₹${onlineAmt} successfully confirmed.`,
        statusBadge: 'PAYMENT CONFIRMED',
        heading: 'Online Advance Marked PAID!',
        message: `Payment of ₹${onlineAmt} for Truck ${tplData.truckNo} was successfully confirmed and updated in VGTC portal.`,
        details: [
            { label: 'Voucher No.', val: `#${vId}` },
            { label: 'Truck No.', val: tplData.truckNo },
            { label: 'Advance Amount', val: `₹${onlineAmt}` },
            { label: 'Status', val: 'PAID ✓' }
        ],
        isSuccess: true
    }));
});

// ─── 2. Mark LR as LOADED ─────────────────────────────────────────────────────
// GET /api/action/loaded/:lrNo
router.get('/loaded/:lrNo', async (req, res) => {
    const lrNo = req.params.lrNo;
    console.log(`[QuickAction] LOADED request for LR "${lrNo}" (Crawler: ${isLinkCrawler(req)})`);

    const found = await findLrRecordByNo(lrNo);
    if (!found) {
        return res.status(404).send(renderHtmlResponse({
            title: `LR #${lrNo} Not Found`,
            ogTitle: `❌ LR #${lrNo} Not Found`,
            ogDesc: 'Please verify the LR number.',
            statusBadge: 'NOT FOUND',
            heading: 'LR Not Found',
            message: `Loading Receipt #${lrNo} could not be located in VGTC records.`,
            isSuccess: false
        }));
    }

    const { lr, colName } = found;
    const lrDisplayNo = lr.lrNo || lrNo;
    const tokenNo = lr.loadingNo || lr.dailyTokenNo || '—';

    // If crawler preview
    if (isLinkCrawler(req)) {
        return res.send(renderHtmlResponse({
            title: `Mark Loaded — LR #${lrDisplayNo}`,
            ogTitle: `✅ Confirm Vehicle Loaded — LR #${lrDisplayNo}`,
            ogDesc: `Token #${tokenNo} · Truck ${lr.truckNo || '—'} · Tap to mark loaded`,
            statusBadge: 'ACTION REQUIRED',
            heading: 'Confirm Loading',
            message: `Tap below to mark Token #${tokenNo} (Truck ${lr.truckNo || '—'}) as LOADED.`,
            details: [
                { label: 'LR No.', val: `#${lrDisplayNo}` },
                { label: 'Token No.', val: `#${tokenNo}` },
                { label: 'Truck No.', val: lr.truckNo || '—' }
            ]
        }));
    }

    // Already Loaded
    if (lr.status === 'Loaded') {
        return res.send(renderHtmlResponse({
            title: `LR #${lrDisplayNo} Already Loaded`,
            ogTitle: `✓ LR #${lrDisplayNo} Already Loaded`,
            ogDesc: `Vehicle ${lr.truckNo || '—'} is already marked loaded.`,
            statusBadge: 'ALREADY LOADED',
            heading: 'Vehicle Already Loaded',
            message: `LR #${lrDisplayNo} (Truck ${lr.truckNo || '—'}) has already been marked as Loaded.`,
            details: [
                { label: 'LR No.', val: `#${lrDisplayNo}` },
                { label: 'Token No.', val: `#${tokenNo}` },
                { label: 'Truck No.', val: lr.truckNo || '—' },
                { label: 'Status', val: 'LOADED' }
            ],
            isSuccess: true
        }));
    }

    // Execute Loaded
    await markLrLoaded(lr.id, colName);
    console.log(`[QuickAction] LR #${lrDisplayNo} marked LOADED via 1-click action link!`);

    const cfg = await getWhatsAppConfig();
    const labourPhones = (cfg.labourPhones || '8708032492').split(',').map(s => s.trim()).filter(Boolean);

    const tplData = {
        lrNo:        lrDisplayNo,
        loadingNo:   tokenNo,
        truckNo:     lr.truckNo || '—',
        source:      lr.source || 'JK Lakshmi Plant (Jharli)',
        destination: lr.destination || '—',
        partyName:   lr.partyName || '—',
        loadedAt:    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };

    // 1. Confirmation to labour
    try {
        const confirmMsg = [
            `*Vehicle Loaded Confirmed — LR #${tplData.lrNo}*`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
            `*Token #:* ${tplData.loadingNo}`,
            `*Truck:* ${tplData.truckNo}`,
            `*Party:* ${tplData.partyName}`,
            `*Loaded At:* ${tplData.loadedAt}`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
            `Status updated to LOADED on VGTC Loading Board.`,
            `_VIKAS GOODS TRANSPORT CO._`
        ].join('\n');
        for (const p of labourPhones) {
            await sendWhatsAppMessage(p, confirmMsg);
        }
    } catch (_) {}

    // 2. Alert creator & admin
    (async () => {
        try {
            const targets = [];
            if (lr.createdByPhone) targets.push(lr.createdByPhone);
            if (cfg.adminPhone && !targets.includes(cfg.adminPhone)) targets.push(cfg.adminPhone);
            if (targets.length) {
                await sendEventNotification('lr_loaded_creator', tplData, targets);
            }
        } catch (_) {}
    })();

    // 3. Create in-app notification
    try {
        await createNotification({
            type: 'vehicle_loaded',
            title: `✅ Vehicle Loaded — LR #${tplData.lrNo}`,
            message: `Truck ${tplData.truckNo} is LOADED & READY FOR DISPATCH. (Token #${tplData.loadingNo} · ${tplData.source} → ${tplData.destination} · ${tplData.partyName})`,
            lrNo: tplData.lrNo,
            truckNo: tplData.truckNo,
            loadingNo: tplData.loadingNo,
            source: tplData.source,
            destination: tplData.destination,
            partyName: tplData.partyName,
            status: 'Loaded'
        });
    } catch (_) {}

    // Render Success Screen
    return res.send(renderHtmlResponse({
        title: `Vehicle Loaded — LR #${lrDisplayNo}`,
        ogTitle: `✅ LR #${lrDisplayNo} Marked LOADED`,
        ogDesc: `Truck ${tplData.truckNo} successfully marked loaded.`,
        statusBadge: 'VEHICLE LOADED',
        heading: 'Vehicle Marked as LOADED!',
        message: `Token #${tplData.loadingNo} (Truck ${tplData.truckNo}) has been updated to LOADED. Creator and Admin have been notified.`,
        details: [
            { label: 'Token No.', val: `#${tplData.loadingNo}` },
            { label: 'LR No.', val: `#${tplData.lrNo}` },
            { label: 'Truck No.', val: tplData.truckNo },
            { label: 'Destination', val: tplData.destination },
            { label: 'Status', val: 'LOADED ✓' }
        ],
        isSuccess: true
    }));
});

module.exports = router;
