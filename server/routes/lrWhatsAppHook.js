/**
 * lrWhatsAppHook.js
 *
 * Shared fire-and-forget WhatsApp notification hook for all LR route files
 * (lrRoutes, jhajjarLrRoutes, kosliLrRoutes, bahadurgarhLrRoutes, jklLrRoutes).
 *
 * Call dispatchLrNotification(lrData, req) AFTER res.json() is called.
 * It never throws, so it is safe in any context.
 */

const { sendEventNotification, lookupVehiclePhone, getWhatsAppConfig } = require('../utils/whatsappService');

/**
 * Builds template data from an LR document and dispatches a WhatsApp
 * notification to the truck owner and (optionally) admin.
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
        const materialsText = materials.map(m => `• ${m.type}: ${m.bags} Bags (${m.weight} MT)`).join('\n');

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

        const vehiclePhone = await lookupVehiclePhone(lrData.truckNo, req);
        const waCfg        = await getWhatsAppConfig(req);
        const phones       = [vehiclePhone, waCfg.adminPhone].filter(Boolean);

        await sendEventNotification('lr_created', templateData, phones, req);
    } catch (e) {
        console.error('[WA-Hook] LR notify FAILED:', e.message);
    }
}

module.exports = { dispatchLrNotification };
