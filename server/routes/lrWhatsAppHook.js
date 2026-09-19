/**
 * lrWhatsAppHook.js
 *
 * Shared fire-and-forget WhatsApp notification hook for all LR route files
 * (lrRoutes, jhajjarLrRoutes, kosliLrRoutes, bahadurgarhLrRoutes, jklLrRoutes).
 *
 * Handles:
 * 1. Rendering and dispatching the Loading Receipt Slip (Image Slip + Caption).
 * 2. Merging Challan information (same vehicle vs transferred challan).
 * 3. Notifying original vehicle owner if another vehicle loaded their challan.
 * 4. Helper `linkChallanToLr` for delayed Challan linking to an LR.
 */

const {
    sendEventNotification,
    sendWhatsAppImage,
    generateLrReceiptImageBuffer,
    lookupVehicleInfo,
    getWhatsAppConfig,
    logWhatsAppActivity,
    DEFAULT_TEMPLATES
} = require('../utils/whatsappService');

const {
    dispatchChallanTransferNotification,
    dispatchChallanLinkedNotification,
    updateChallanTransferRecord
} = require('../utils/challanNotificationService');

function cleanDigits(phone) {
    if (!phone) return '';
    let c = String(phone).replace(/\D/g, '');
    if (c.length === 10) c = '91' + c;
    return c;
}

/**
 * Builds template data from an LR document, generates the receipt image card,
 * deduplicates recipient phone numbers, handles Challan merging / transfer alerts,
 * and dispatches via Meta WhatsApp Cloud API.
 *
 * @param {object} lrData   Merged { ...req.body, ...result }
 * @param {object} req      Express request object (for org context)
 */
async function dispatchLrNotification(lrData, req) {
    try {
        const materials = Array.isArray(lrData.materials) && lrData.materials.length > 0
            ? lrData.materials
            : [{ type: lrData.material || 'Cement', bags: lrData.bags || 0, weight: lrData.weight || 0 }];

        const totalBags   = materials.reduce((s, m) => s + (parseInt(m.bags)       || 0), 0);
        const totalWeight = materials.reduce((s, m) => s + (parseFloat(m.weight)   || 0), 0);
        const freight     = parseFloat(lrData.freight || 0);
        const mainMaterial = materials[0]?.type || lrData.material || 'Cement';
        let loadingType = lrData.loadingType || materials.find(m => m.loadingType)?.loadingType;
        if (!loadingType) {
            if (lrData.isTransfer || (lrData.partyName && lrData.partyName.toLowerCase().includes('transfer')) || (lrData.destination && lrData.destination.toLowerCase().includes('transfer'))) {
                loadingType = 'Transfer';
            } else {
                loadingType = 'From Godown';
            }
        }
        const loadingNo = lrData.loadingNo || lrData.dailyTokenNo || 1;

        const materialsText = materials.map(m => {
            const lt = m.loadingType && m.loadingType !== loadingType ? ` [${m.loadingType}]` : '';
            return `· ${m.type}: ${m.bags} Bags (${parseFloat(m.weight || 0).toFixed(2)} MT)${lt}`;
        }).join('\n');

        let source = lrData.source || lrData.loadingPoint || '';
        if (!source) {
            const url = (req?.originalUrl || req?.baseUrl || '').toLowerCase();
            if (url.includes('jhajjar')) source = 'Jhajjar';
            else if (url.includes('kosli')) source = 'Kosli';
            else if (url.includes('bahadurgarh')) source = 'Bahadurgarh';
            else if (url.includes('jkl') || lrData.brand === 'jklakshmi') source = 'JK Lakshmi Plant (Jharli)';
            else source = 'JK Super Plant (Jharli)';
        }

        const templateData = {
            lrNo:         lrData.lrNo,
            loadingNo,
            dailyTokenNo: loadingNo,
            date:         lrData.date || new Date().toLocaleDateString('en-IN'),
            truckNo:      lrData.truckNo,
            source,
            destination:  lrData.destination,
            partyName:    lrData.partyName,
            material:     mainMaterial,
            loadingType,
            materialsText,
            totalWeight:  totalWeight.toFixed(2),
            totalBags,
            freight,
            totalFreight: (freight * totalWeight).toFixed(0),
            billing:      lrData.billing || '—',
            remark:       lrData.remark  || '—',
        };

        const vInfo       = await lookupVehicleInfo(lrData.truckNo, req);
        const waCfg       = await getWhatsAppConfig(req);
        const adminPhone  = waCfg.adminPhone || '8708032492';

        const isSelf = (vInfo?.ownershipType === 'self') || (lrData.ownershipType === 'self') || (lrData.isSelf === true);
        const ownerPhone  = vInfo?.ownerContact || lrData.ownerContact || '';
        const driverPhone = vInfo?.driverContact || lrData.driverContact || '';

        // ── Process Challans Used & Check for Transfers ──────────────────────────
        let challanDetailsList = [];
        let usedChallanNos = [];
        if (Array.isArray(lrData.usedChallans) && lrData.usedChallans.length > 0) {
            challanDetailsList = lrData.usedChallans;
        } else if (lrData.billing && lrData.billing !== 'No' && lrData.billing !== '—') {
            usedChallanNos = String(lrData.billing).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
        }

        const challanSummaryLines = [];
        const loadingTruck = String(lrData.truckNo || '').toUpperCase().replace(/\s+/g, '');

        if (challanDetailsList.length > 0) {
            for (const ch of challanDetailsList) {
                const cNo = ch.challanNo;
                if (!cNo) continue;
                const rec = await updateChallanTransferRecord(cNo, loadingTruck, lrData.lrNo, templateData.date, req);
                const isTransfer = rec ? rec.isTransfer : (ch.truckNo && String(ch.truckNo).toUpperCase().replace(/\s+/g, '') !== loadingTruck);
                const origTruck = rec ? rec.originalTruck : ch.truckNo;
                const chBags = ch.quantity || (ch.materials ? ch.materials.reduce((s, m) => s + (parseInt(m.totalBags || m.bags || 0)), 0) : totalBags);
                const chWeight = (chBags * 0.05).toFixed(2);

                if (isTransfer) {
                    challanSummaryLines.push(`• Challan #${cNo} (From ${origTruck}): ${chBags} Bags (${chWeight} MT)`);
                    // Alert original owner about the transfer
                    await dispatchChallanTransferNotification({
                        challanNo: cNo,
                        originalTruck: origTruck,
                        loadingTruck: lrData.truckNo,
                        lrNo: lrData.lrNo,
                        date: templateData.date,
                        totalBags: chBags,
                        totalWeight: chWeight
                    }, req);
                } else {
                    challanSummaryLines.push(`• Challan #${cNo}: ${chBags} Bags (${chWeight} MT)`);
                }
            }
        } else if (usedChallanNos.length > 0) {
            for (const cNo of usedChallanNos) {
                const rec = await updateChallanTransferRecord(cNo, loadingTruck, lrData.lrNo, templateData.date, req);
                if (rec && rec.isTransfer) {
                    const chBags = totalBags;
                    const chWeight = totalWeight.toFixed(2);
                    challanSummaryLines.push(`• Challan #${cNo} (From ${rec.originalTruck}): ${chBags} Bags (${chWeight} MT)`);
                    await dispatchChallanTransferNotification({
                        challanNo: cNo,
                        originalTruck: rec.originalTruck,
                        loadingTruck: lrData.truckNo,
                        lrNo: lrData.lrNo,
                        date: templateData.date,
                        totalBags: chBags,
                        totalWeight: chWeight
                    }, req);
                } else {
                    challanSummaryLines.push(`• Challan #${cNo}: ${totalBags} Bags (${totalWeight.toFixed(2)} MT)`);
                }
            }
        }

        // 1. Render the Loading Receipt Slip PNG image buffer
        let receiptImageBuffer = null;
        try {
            receiptImageBuffer = generateLrReceiptImageBuffer({
                lrNo: lrData.lrNo,
                loadingNo,
                date: templateData.date,
                truckNo: lrData.truckNo,
                source,
                partyName: lrData.partyName,
                material: lrData.material,
                godown: lrData.godown,
                remark: lrData.remark,
                bags: totalBags,
                weight: totalWeight,
                materials
            });
        } catch (imgErr) {
            console.error('[WA-Hook] Failed to render LR receipt image:', imgErr.message);
        }

        // 2. Deduplicate phone numbers: Each unique phone number receives EXACTLY 1 dispatch!
        const recipientMap = new Map();

        const cleanDriver = cleanDigits(driverPhone);
        const cleanOwner  = cleanDigits(ownerPhone);
        const cleanAdmin  = cleanDigits(adminPhone);

        // Driver recipient
        if (cleanDriver) {
            recipientMap.set(cleanDriver, { eventKey: 'lr_created_driver', rawPhone: driverPhone });
        }

        // Owner recipient (market vehicles only) — takes precedence if owner == driver
        if (!isSelf && cleanOwner) {
            recipientMap.set(cleanOwner, { eventKey: 'lr_created_owner', rawPhone: ownerPhone });
        }

        // Admin recipient — sent ONLY if admin phone is distinct from owner/driver
        if (cleanAdmin && !recipientMap.has(cleanAdmin)) {
            recipientMap.set(cleanAdmin, { eventKey: 'lr_created_owner', rawPhone: adminPhone });
        }

        // 3. Dispatch to each unique recipient phone (Image Slip + Caption)
        const captionLines = [
            `*VIKAS GOODS TRANSPORT CO.*`,
            `📋 *Loading Receipt Slip — LR #${lrData.lrNo}*`,
            `*Date:* ${templateData.date} | *Token:* #${loadingNo}`,
            `*Truck:* ${String(lrData.truckNo || '—').toUpperCase()}`,
            `*Party:* ${lrData.partyName || '—'}`,
            `*Route:* ${source} ➔ ${lrData.destination || '—'}`,
            `*Material:* ${mainMaterial} (${totalWeight.toFixed(2)} MT / ${totalBags} Bags)`
        ];

        if (challanSummaryLines.length > 0) {
            captionLines.push(`*Challan(s) Used:*\n${challanSummaryLines.join('\n')}`);
        }

        const imageCaption = captionLines.join('\n');

        logWhatsAppActivity({
            type: 'outbound',
            category: 'lr_created',
            phone: lrData.truckNo || '',
            status: 'sent',
            title: `LR #${lrData.lrNo} Dispatched`,
            details: `LR #${lrData.lrNo} (${lrData.truckNo}) → ${lrData.destination || 'Unspecified'} | ${totalWeight.toFixed(2)} MT`
        });

        for (const [cleanP, info] of recipientMap.entries()) {
            const rawPhone = info.rawPhone;
            const eventKey = info.eventKey;
            try {
                if (receiptImageBuffer) {
                    await sendWhatsAppImage(rawPhone, receiptImageBuffer, imageCaption, req);
                    console.log(`[WA-Hook] LR receipt image slip sent to ${rawPhone} (${eventKey})`);
                } else {
                    await sendEventNotification(eventKey, templateData, [rawPhone], req);
                    console.log(`[WA-Hook] ${eventKey} text alert sent to ${rawPhone}`);
                }
            } catch (err) {
                console.error(`[WA-Hook] Alert to ${rawPhone} failed:`, err.message);
                try {
                    await sendEventNotification(eventKey, templateData, [rawPhone], req);
                } catch (_) {}
            }
        }

        // 4. Dispatch to Labour Team (number-wise loading queue)
        const labourRaw = (waCfg.labourPhones || waCfg.labourPhone || '8708032492').trim();
        if (labourRaw) {
            const labourPhones = labourRaw.split(/[,;\s]+/).filter(Boolean);
            if (labourPhones.length > 0) {
                await sendEventNotification('lr_loading_labour', templateData, labourPhones, req);
                console.log(`[WA-Hook] Labour Loading Alert sent to ${labourPhones.join(', ')}`);
            }
        }
    } catch (e) {
        console.error('[WA-Hook] LR notify FAILED:', e.message);
    }
}

/**
 * Shared handler for linking a challan to an existing LR record (delayed linking).
 * Handles:
 * - Updating LR billing field
 * - Updating Challan transfer record (loadedByVehicle, transferredTo, lrNo)
 * - Syncing stock bag deduction
 * - Dispathing WhatsApp notifications (to loading vehicle owner, and to original vehicle owner if transferred)
 */
async function linkChallanToLr({ lrId, challanNo, quantity, material, lrCollection, brand, orgId, req }) {
    const lrService = require('../services/lrService');
    const stockService = require('../utils/stockService');

    const all = await lrService.getAllLoadingReceipts(orgId, lrCollection);
    const receipt = all.find(r => r.id === lrId);
    if (!receipt) throw new Error('Loading receipt not found');

    const cleanCNo = String(challanNo).trim();
    const existingBilling = (receipt.billing && receipt.billing !== 'No' && receipt.billing !== '—') ? receipt.billing : '';
    const newBilling = existingBilling ? `${existingBilling}, ${cleanCNo}` : cleanCNo;

    // 1. Update LR billing
    await lrService.updateBillingStatus(lrId, newBilling, lrCollection);

    // 2. Update Challan transfer record
    const rec = await updateChallanTransferRecord(cleanCNo, receipt.truckNo, receipt.lrNo, receipt.date, req);

    // 3. Sync stock bags deduction
    const cCol = brand === 'jkl' ? 'jkl_challans' : (brand === 'kosli' ? 'kosli_challans' : (brand === 'jhajjar' ? 'jhajjar_challans' : 'challans'));
    const deductQty = parseInt(quantity) || parseInt(receipt.totalBags) || 0;
    if (deductQty > 0) {
        await stockService.syncLRWithChallans(orgId, '', cleanCNo, material || receipt.material, deductQty, cCol);
    }

    // 4. Send WhatsApp notifications
    const chBags = deductQty;
    const chWeight = (chBags * 0.05).toFixed(2);
    const isTransfer = rec ? rec.isTransfer : false;
    const origTruck = rec ? rec.originalTruck : receipt.truckNo;

    if (isTransfer) {
        // Alert original owner about transfer
        await dispatchChallanTransferNotification({
            challanNo: cleanCNo,
            originalTruck: origTruck,
            loadingTruck: receipt.truckNo,
            lrNo: receipt.lrNo,
            date: receipt.date || new Date().toISOString().slice(0, 10),
            totalBags: chBags,
            totalWeight: chWeight
        }, req);

        // Alert loading truck owner about attached transfer challan
        await dispatchChallanLinkedNotification({
            challanNo: cleanCNo,
            truckNo: receipt.truckNo,
            lrNo: receipt.lrNo,
            date: receipt.date,
            materialsText: `Transferred from ${origTruck} — ${chBags} Bags (${chWeight} MT)`
        }, req);
    } else {
        // Same vehicle
        await dispatchChallanLinkedNotification({
            challanNo: cleanCNo,
            truckNo: receipt.truckNo,
            lrNo: receipt.lrNo,
            date: receipt.date,
            materialsText: `${chBags} Bags (${chWeight} MT)`
        }, req);
    }

    return { ok: true, billing: newBilling, isTransfer, originalTruck: origTruck };
}

module.exports = {
    dispatchLrNotification,
    linkChallanToLr
};
