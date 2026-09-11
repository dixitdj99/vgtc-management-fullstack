/**
 * lrWhatsAppHook.js
 *
 * Shared fire-and-forget WhatsApp notification hook for all LR route files
 * (lrRoutes, jhajjarLrRoutes, kosliLrRoutes, bahadurgarhLrRoutes, jklLrRoutes).
 *
 * Call dispatchLrNotification(lrData, req) AFTER res.json() is called.
 * It never throws, so it is safe in any context.
 */

const {
    sendEventNotification,
    sendWhatsAppImage,
    generateLrReceiptImageBuffer,
    lookupVehicleInfo,
    getWhatsAppConfig,
    DEFAULT_TEMPLATES
} = require('../utils/whatsappService');

function cleanDigits(phone) {
    if (!phone) return '';
    let c = String(phone).replace(/\D/g, '');
    if (c.length === 10) c = '91' + c;
    return c;
}

/**
 * Builds template data from an LR document, generates the receipt image card,
 * deduplicates recipient phone numbers, and dispatches via OpenWA.
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
        const materialsText = materials.map(m => `- ${m.type}: ${m.bags} Bags (${m.weight} MT)`).join('\n');

        const templateData = {
            lrNo:         lrData.lrNo,
            date:         lrData.date || new Date().toLocaleDateString('en-IN'),
            truckNo:      lrData.truckNo,
            source:       lrData.source || 'Jhajjar',
            destination:  lrData.destination,
            partyName:    lrData.partyName,
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

        // 1. Render the Loading Receipt Slip PNG image buffer
        let receiptImageBuffer = null;
        try {
            receiptImageBuffer = generateLrReceiptImageBuffer({
                lrNo: lrData.lrNo,
                date: templateData.date,
                truckNo: lrData.truckNo,
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

        // 3. Dispatch to each unique recipient phone
        for (const [cleanP, info] of recipientMap.entries()) {
            const rawPhone = info.rawPhone;
            const eventKey = info.eventKey;

            const eventCfg = (waCfg.events || {})[eventKey] || DEFAULT_TEMPLATES[eventKey];
            const captionText = eventCfg && eventCfg.template
                ? eventCfg.template.replace(/\{(\w+)\}/g, (_, k) => templateData[k] !== undefined ? templateData[k] : '')
                : `VGTC Loading Receipt #${templateData.lrNo} - ${templateData.truckNo}`;

            let sentImage = false;
            if (receiptImageBuffer) {
                try {
                    await sendWhatsAppImage(rawPhone, receiptImageBuffer, captionText, req);
                    console.log(`[WA-Hook] LR Receipt Image sent to ${rawPhone}`);
                    sentImage = true;
                } catch (imgSendErr) {
                    console.error(`[WA-Hook] Image dispatch to ${rawPhone} failed, falling back to text:`, imgSendErr.message);
                }
            }

            if (!sentImage) {
                await sendEventNotification(eventKey, templateData, [rawPhone], req);
            }
        }
    } catch (e) {
        console.error('[WA-Hook] LR notify FAILED:', e.message);
    }
}

module.exports = { dispatchLrNotification };
